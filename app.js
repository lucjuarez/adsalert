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
// 📩 MÓDULO DE EMAIL (Configurado con tu captura)
// ==========================================
const transporter = nodemailer.createTransport({
  host: "mail.lucianojuarez.com.ar", 
  port: 465,
  secure: true, // true porque usas SSL puerto 465
  auth: {
    user: process.env.EMAIL_USER || "alertads@lucianojuarez.com.ar",
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false // Vital para evitar bloqueos del certificado SSL del hosting
  }
});

async function sendEmail({ email, message, subject = "🚨 AdsAlert: Notificación" }) {
  try {
    await transporter.sendMail({
      from: '"AdsAlert Global" <alertads@lucianojuarez.com.ar>',
      to: email,
      subject: subject,
      text: message
    });
    console.log(`✅ Email enviado a: ${email}`);
  } catch (error) {
    console.error("❌ Error enviando email:", error.message);
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

    return { spend, totalResults, cpr, ctr, frequency: frequency.toFixed(2) };
  } catch (error) { return null; }
}

// ==========================================
// 🚀 ESCANEO INMEDIATO (El "Dashboard" por mail)
// ==========================================
async function runInitialScan(userConfig) {
  console.log("Iniciando escaneo inicial para:", userConfig.email);
  try {
    const accountsRes = await axios.get(
      `https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id,account_status&limit=100&access_token=${userConfig.token}`
    );
    const accounts = accountsRes.data.data || [];
    let reporteList = [];

    for (let acc of accounts) {
      if (acc.account_status !== 1) continue;
      const accountId = `act_${acc.account_id}`;
      const metrics = await getAccountInsights(accountId, userConfig.token);
      
      if (metrics) {
        reporteList.push(`📌 ${acc.name}\nGastado: $${metrics.spend} | CPA: $${metrics.cpr} | CTR: ${metrics.ctr}% | Freq: ${metrics.frequency}\n`);
      }
    }

    let msg = `¡Hola!\n\nAdsAlert se ha conectado exitosamente a tu Business Manager.\n\nAcá tenés tu PRIMER REPORTE INMEDIATO con el estado de las cuentas que están corriendo ahora mismo:\n\n`;
    if (reporteList.length > 0) {
      msg += reporteList.join('\n');
    } else {
      msg += "No hay cuentas gastando presupuesto en este momento.\n";
    }
    msg += `\nEl motor de AdsAlert ahora vigilará estos números 24/7 de forma silenciosa en la nube.\n\nSaludos,\nSistema AdsAlert`;

    await sendEmail({ email: userConfig.email, subject: "✅ AdsAlert Activado: Tu Primer Reporte", message: msg });
  } catch(e) {
    console.error("Error en escaneo inicial:", e.message);
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

  // Disparamos el reporte instantáneo POR MAIL en segundo plano
  runInitialScan(config);
});

app.get("/health", (req, res) => res.send("🚀 Backend OK"));

// ==========================================
// ⏰ MÓDULO CRON (Vigilancia 24/7)
// ==========================================
cron.schedule("*/5 * * * *", async () => {
  for (let user of users) {
    try {
      const accountsRes = await axios.get(`https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id,account_status&limit=100&access_token=${user.token}`);
      const accounts = accountsRes.data.data || [];
      let reporteDiarioCuentas = [];

      for (let acc of accounts) {
        if (acc.account_status !== 1) continue;
        const metrics = await getAccountInsights(`act_${acc.account_id}`, user.token);
        if (!metrics) continue;

        let problemas = [];
        if (metrics.ctr > 0 && metrics.ctr < 1) problemas.push(`CTR bajo (${metrics.ctr}%)`);
        if (metrics.frequency > 3) problemas.push(`Frecuencia alta (${metrics.frequency})`);
        if (metrics.spend > 0 && metrics.totalResults === 0) problemas.push(`Gasto sin conversiones.`);

        if (user.alerts && problemas.length > 0) {
          await sendEmail({
            email: user.email,
            subject: `🚨 ALERTA CRÍTICA: ${acc.name}`,
            message: `Atención en la cuenta "${acc.name}":\n${problemas.join('\n')}\nCPA actual: $${metrics.cpr}`
          });
        }
        reporteDiarioCuentas.push(`📌 ${acc.name}\nCPA: $${metrics.cpr} | CTR: ${metrics.ctr}%`);
      }

      const now = new Date();
      const hourStr = now.toTimeString().slice(0,5);
      if (user.daily && user.hour === hourStr && user.lastReport !== hourStr) {
        user.lastReport = hourStr;
        if (reporteDiarioCuentas.length > 0) {
          await sendEmail({ email: user.email, subject: "📊 AdsAlert: Resumen Diario", message: `Resumen de tu portafolio hoy:\n\n${reporteDiarioCuentas.join('\n\n')}` });
        }
      }
    } catch (e) { console.error("Error Cron:", e.message); }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
