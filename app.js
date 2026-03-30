require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const cron = require("node-cron");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// 📩 MÓDULO DE EMAIL (Configuración Puerto 587)
// ==========================================
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "mail.lucianojuarez.com.ar",
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false, 
  auth: {
    user: process.env.EMAIL_USER || "alertads@lucianojuarez.com.ar",
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false,
    minVersion: "TLSv1.2"
  },
  connectionTimeout: 20000, // 20 segundos
  greetingTimeout: 20000
});

// Verificador de conexión al arrancar
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ ERROR SMTP AL ARRANCAR:", error.message);
  } else {
    console.log("✅ CONEXIÓN SMTP ESTABLECIDA: El servidor de mail está listo.");
  }
});

async function sendEmail({ email, message, subject = "🚨 AdsAlert: Notificación" }) {
  console.log(`--- Intentando enviar email a: ${email} ---`);
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER || "alertads@lucianojuarez.com.ar",
      to: email,
      subject: subject,
      text: message
    });
    console.log("✅ EMAIL ENVIADO CON ÉXITO:", info.response);
  } catch (error) {
    console.error("❌ FALLO FINAL EN EL ENVÍO:", error.message);
  }
}

// ==========================================
// 📊 MÓDULO META (Extracción de Datos)
// ==========================================
async function getAccountInsights(accountId, token, accountName) {
  try {
    const res = await axios.get(
      `https://graph.facebook.com/v19.0/${accountId}/insights`,
      { params: { fields: "spend,impressions,clicks,actions,frequency", date_preset: "last_7d", access_token: token } }
    );
    const data = res.data.data[0] || {};
    const spend = parseFloat(data.spend || 0);
    
    // Log de progreso para que veas que el sistema NO está trabado
    console.log(`🔎 Procesada: ${accountName} | Gasto: $${spend}`);

    if (spend === 0) return null;

    const impressions = parseFloat(data.impressions || 0);
    const clicks = parseFloat(data.clicks || 0);
    const frequency = parseFloat(data.frequency || 0);
    
    let totalResults = 0;
    if (data.actions) {
      data.actions.forEach(a => {
        if (a.action_type.includes("purchase") || a.action_type.includes("lead") || a.action_type.includes("messaging")) {
          totalResults += (parseInt(a.value) || 0);
        }
      });
    }

    const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : 0;
    const cpr = totalResults > 0 ? (spend / totalResults).toFixed(2) : 0;

    return { name: accountName, spend, totalResults, cpr, ctr, frequency: frequency.toFixed(2) };
  } catch (error) { 
    return null; 
  }
}

// ==========================================
// 🚀 ESCANEO INMEDIATO (Reporte de Activación)
// ==========================================
async function runInitialScan(userConfig) {
  console.log("🚀 Iniciando auditoría inmediata. Preparando procesamiento paralelo...");
  try {
    const accountsRes = await axios.get(
      `https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id,account_status&limit=100&access_token=${userConfig.token}`
    );
    const accounts = accountsRes.data.data || [];
    
    // Procesamos todas las cuentas en paralelo para que el reporte no tarde siglos
    const promises = accounts
      .filter(acc => acc.account_status === 1)
      .map(acc => getAccountInsights(`act_${acc.account_id}`, userConfig.token, acc.name));

    const results = await Promise.all(promises);
    const activeResults = results.filter(r => r !== null);

    let reporteList = activeResults.map(r => `📌 ${r.name}\nGastado: $${r.spend} | CPA: $${r.cpr} | CTR: ${r.ctr}% | Freq: ${r.frequency}\n`);

    let msg = `¡Hola!\n\nAdsAlert se ha conectado exitosamente.\n\nEste es tu reporte de activación con el estado de tus cuentas activas:\n\n`;
    if (reporteList.length > 0) {
      msg += reporteList.join('\n');
    } else {
      msg += "No se detectaron cuentas con inversión activa en los últimos 7 días.\n";
    }
    msg += `\nEl motor de AdsAlert ahora vigilará estos indicadores 24/7.\n\nSaludos,\nAdsAlert`;

    await sendEmail({ email: userConfig.email, subject: "✅ AdsAlert: Auditoría Activada", message: msg });
  } catch(e) {
    console.error("❌ Error en escaneo inicial:", e.message);
  }
}

// ==========================================
// 🧠 ENDPOINTS
// ==========================================
let users = []; 

app.post("/save-config", (req, res) => {
  const { token, email, alerts, daily, hour } = req.body;
  const existingIndex = users.findIndex(u => u.email === email);
  const config = { token, email, alerts, daily, hour, lastReport: null };

  if (existingIndex >= 0) users[existingIndex] = config;
  else users.push(config);

  res.json({ status: "OK" });

  // Ejecución en segundo plano
  runInitialScan(config);
});

app.get("/health", (req, res) => res.send("🚀 Backend AdsAlert OK"));

// ==========================================
// ⏰ MÓDULO CRON (Vigilancia cada 5 min)
// ==========================================
cron.schedule("*/5 * * * *", async () => {
  console.log("⏰ Revisando portafolios...");
  for (let user of users) {
    try {
      const accountsRes = await axios.get(`https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id,account_status&limit=100&access_token=${user.token}`);
      const accounts = accountsRes.data.data || [];
      let reporteDiarioCuentas = [];

      for (let acc of accounts) {
        if (acc.account_status !== 1) continue;
        const metrics = await getAccountInsights(`act_${acc.account_id}`, user.token, acc.name);
        if (!metrics) continue;

        let problemas = [];
        if (metrics.ctr > 0 && metrics.ctr < 1) problemas.push(`CTR bajo (${metrics.ctr}%)`);
        if (metrics.frequency > 3) problemas.push(`Frecuencia alta (${metrics.frequency})`);
        if (metrics.spend > 0 && metrics.totalResults === 0) problemas.push(`Gasto sin resultados.`);

        if (user.alerts && problemas.length > 0) {
          await sendEmail({
            email: user.email,
            subject: `🚨 ALERTA: ${acc.name}`,
            message: `Atención en "${acc.name}":\n${problemas.join('\n')}\nCPA actual: $${metrics.cpr}`
          });
        }
        reporteDiarioCuentas.push(`📌 ${acc.name}\nCPA: $${metrics.cpr} | CTR: ${metrics.ctr}%`);
      }

      const now = new Date();
      const hourStr = now.toTimeString().slice(0,5);
      if (user.daily && user.hour === hourStr && user.lastReport !== hourStr) {
        user.lastReport = hourStr;
        if (reporteDiarioCuentas.length > 0) {
          await sendEmail({ email: user.email, subject: "📊 AdsAlert: Resumen Diario", message: `Este es el estado de tu portafolio:\n\n${reporteDiarioCuentas.join('\n\n')}` });
        }
      }
    } catch (e) { console.error("❌ Error en ciclo Cron:", e.message); }
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 AdsAlert corriendo en puerto ${PORT}`));
