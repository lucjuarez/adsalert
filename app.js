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
// Usamos el puerto 587 para evitar el bloqueo de red ETIMEDOUT detectado
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "mail.lucianojuarez.com.ar",
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false, // false para puerto 587 (usa STARTTLS)
  auth: {
    user: process.env.EMAIL_USER || "alertads@lucianojuarez.com.ar",
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false, // Permite certificados del hosting sin bloquear la conexión
    minVersion: "TLSv1.2"
  }
});

// Verificador de conexión al arrancar el servidor (aparecerá en logs de Render)
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ ERROR DE CONEXIÓN SMTP:", error.message);
  } else {
    console.log("✅ Conexión con el servidor de correo establecida con éxito.");
  }
});

async function sendEmail({ email, message, subject = "🚨 AdsAlert: Notificación" }) {
  console.log(`--- Iniciando intento de envío a: ${email} ---`);
  try {
    const info = await transporter.sendMail({
      from: `"AdsAlert Global" <${process.env.EMAIL_USER || "alertads@lucianojuarez.com.ar"}>`,
      to: email,
      subject: subject,
      text: message
    });
    console.log("✅ Email enviado con éxito. Respuesta:", info.response);
  } catch (error) {
    console.error("❌ ERROR EN EL ENVÍO:", error.message);
  }
}

// ==========================================
// 📊 MÓDULO META (Extracción de Datos)
// ==========================================
async function getAccountInsights(accountId, token) {
  try {
    const res = await axios.get(
      `https://graph.facebook.com/v19.0/${accountId}/insights`,
      { params: { fields: "spend,impressions,clicks,actions,frequency", date_preset: "last_7d", access_token: token } }
    );
    const data = res.data.data[0] || {};
    const spend = parseFloat(data.spend || 0);
    
    // Si la cuenta no gastó nada en los últimos 7 días, no la auditamos
    if (spend === 0) return null;

    const impressions = parseFloat(data.impressions || 0);
    const clicks = parseFloat(data.clicks || 0);
    const frequency = parseFloat(data.frequency || 0);
    
    let totalResults = 0;
    if (data.actions) {
      data.actions.forEach(a => {
        // Filtro para Compras, Leads y Mensajes
        if (a.action_type.includes("purchase") || a.action_type.includes("lead") || a.action_type.includes("messaging")) {
          totalResults += (parseInt(a.value) || 0);
        }
      });
    }

    const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : 0;
    const cpr = totalResults > 0 ? (spend / totalResults).toFixed(2) : 0;

    return { spend, totalResults, cpr, ctr, frequency: frequency.toFixed(2) };
  } catch (error) { return null; }
}

// ==========================================
// 🚀 ESCANEO INMEDIATO (Reporte de Bienvenida)
// ==========================================
async function runInitialScan(userConfig) {
  console.log("🚀 Ejecutando auditoría inmediata para:", userConfig.email);
  try {
    const accountsRes = await axios.get(
      `https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id,account_status&limit=100&access_token=${userConfig.token}`
    );
    const accounts = accountsRes.data.data || [];
    let reporteList = [];

    for (let acc of accounts) {
      if (acc.account_status !== 1) continue; // Solo cuentas activas
      const accountId = `act_${acc.account_id}`;
      const metrics = await getAccountInsights(accountId, userConfig.token);
      
      if (metrics) {
        reporteList.push(`📌 ${acc.name}\nGastado: $${metrics.spend} | CPA: $${metrics.cpr} | CTR: ${metrics.ctr}% | Freq: ${metrics.frequency}\n`);
      }
    }

    let msg = `¡Hola!\n\nAdsAlert se ha conectado exitosamente a tu Business Manager.\n\nEste es tu reporte de activación inmediata con las cuentas que están corriendo ahora:\n\n`;
    if (reporteList.length > 0) {
      msg += reporteList.join('\n');
    } else {
      msg += "No se detectó inversión en los últimos 7 días en tus cuentas activas.\n";
    }
    msg += `\nEl motor de AdsAlert ahora vigilará estos indicadores 24/7 de forma automática.\n\nSaludos,\nAdsAlert`;

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

  // Disparo inmediato del reporte por correo
  runInitialScan(config);
});

app.get("/health", (req, res) => res.send("🚀 AdsAlert Backend OK"));

// ==========================================
// ⏰ MÓDULO CRON (Vigilancia cada 5 minutos)
// ==========================================
cron.schedule("*/5 * * * *", async () => {
  console.log("⏰ Revisando portafolios multicuenta...");
  for (let user of users) {
    try {
      const accountsRes = await axios.get(`https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id,account_status&limit=100&access_token=${user.token}`);
      const accounts = accountsRes.data.data || [];
      let reporteDiarioCuentas = [];

      for (let acc of accounts) {
        if (acc.account_status !== 1) continue;
        const metrics = await getAccountInsights(`act_${acc.account_id}`, user.token);
        if (!metrics) continue;

        // Evaluación de reglas de alerta solicitadas
        let problemas = [];
        if (metrics.ctr > 0 && metrics.ctr < 1) problemas.push(`CTR bajo (${metrics.ctr}%)`);
        if (metrics.frequency > 3) problemas.push(`Frecuencia alta (${metrics.frequency})`);
        if (metrics.spend > 0 && metrics.totalResults === 0) problemas.push(`Gasto sin resultados registrados.`);

        if (user.alerts && problemas.length > 0) {
          await sendEmail({
            email: user.email,
            subject: `🚨 ALERTA: ${acc.name}`,
            message: `Atención en la cuenta "${acc.name}":\n${problemas.join('\n')}\nCPA actual: $${metrics.cpr}`
          });
        }
        reporteDiarioCuentas.push(`📌 ${acc.name}\nCPA: $${metrics.cpr} | CTR: ${metrics.ctr}%`);
      }

      const now = new Date();
      const hourStr = now.toTimeString().slice(0,5);
      // Reporte diario a las 08:00 AM
      if (user.daily && user.hour === hourStr && user.lastReport !== hourStr) {
        user.lastReport = hourStr;
        if (reporteDiarioCuentas.length > 0) {
          await sendEmail({ email: user.email, subject: "📊 AdsAlert: Resumen Diario", message: `Este es el estado de tu portafolio hoy:\n\n${reporteDiarioCuentas.join('\n\n')}` });
        }
      }
    } catch (e) { console.error("❌ Error en ciclo Cron:", e.message); }
  }
});

// El puerto se lee de la variable de entorno de Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 AdsAlert corriendo en puerto ${PORT}`));
