require("dotenv").config(); // Carga variables de entorno para proteger contraseñas
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const cron = require("node-cron");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// 📩 MÓDULO DE EMAIL (Nodemailer)
// ==========================================
const transporter = nodemailer.createTransport({
  host: "mail.lucianojuarez.com.ar",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER || "alertads@lucianojuarez.com.ar",
    pass: process.env.EMAIL_PASS // ¡La contraseña ahora está segura en Render!
  }
});

async function sendEmail({ email, message }) {
  try {
    await transporter.sendMail({
      from: '"AdsAlert" <alertads@lucianojuarez.com.ar>',
      to: email,
      subject: "🚨 Alerta AdsAlert",
      text: message
    });
  } catch (error) {
    console.error("Error enviando email:", error.message);
  }
}

// ==========================================
// 📊 MÓDULO META (Procesamiento de Datos)
// ==========================================
function buildResults(data) {
  let resultTypes = { purchase: 0, lead: 0, message: 0, traffic: 0 };
  if (data.actions) {
    data.actions.forEach(a => {
      const value = parseInt(a.value) || 0;
      if (a.action_type.includes("purchase")) resultTypes.purchase += value;
      if (a.action_type.includes("lead")) resultTypes.lead += value;
      if (a.action_type.includes("messaging")) resultTypes.message += value;
      if (a.action_type.includes("landing_page_view")) resultTypes.traffic += value;
    });
  }
  return resultTypes;
}

function buildObjectiveData(results, spend) {
  let output = [];
  Object.keys(results).forEach(key => {
    if (results[key] > 0) {
      output.push({ type: key, results: results[key], cost: spend / results[key] });
    }
  });
  return output;
}

async function getInsights(accountId, token) {
  const res = await axios.get(
    `https://graph.facebook.com/v19.0/${accountId}/insights`,
    {
      params: {
        fields: "spend,impressions,clicks,actions,frequency",
        date_preset: "last_7d",
        access_token: token
      }
    }
  );
  const data = res.data.data[0] || {};
  const spend = parseFloat(data.spend || 0);
  const impressions = parseFloat(data.impressions || 0);
  const clicks = parseFloat(data.clicks || 0);
  const frequency = parseFloat(data.frequency || 0);

  const results = buildResults(data);
  const objectives = buildObjectiveData(results, spend);

  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;

  return { spend, objectives, ctr: ctr.toFixed(2), cpc: cpc.toFixed(2), cpm: cpm.toFixed(2), frequency };
}

function checkAlerts(data) {
  if (data.spend === 0) return { type: "warning", message: "Sin inversión" };
  if (data.objectives.length === 0) return { type: "critical", message: "Sin resultados" };
  return { type: "ok", message: "Funcionando" };
}

function generateInsights(data) {
  let insights = [];
  if (data.ctr < 1) insights.push("CTR bajo");
  if (data.frequency > 3) insights.push("Saturación");
  return insights;
}

// ==========================================
// 🧠 MÓDULO CORE (Endpoints)
// ==========================================
let users = []; // Base de datos temporal en memoria

app.post("/save-config", (req, res) => {
  const { token, accountId, accountName, email, alerts, daily, hour } = req.body;
  const existingIndex = users.findIndex(u => u.accountId === accountId);
  const config = { token, accountId, accountName, email, alerts, daily, hour, lastReport: null };

  if (existingIndex >= 0) {
    users[existingIndex] = config;
  } else {
    users.push(config);
  }
  res.json({ status: "OK", message: "Vigilancia activada para " + accountName });
});

app.get("/health", (req, res) => {
    res.send("🚀 AdsAlert Backend Running OK");
});

// ==========================================
// ⏰ MÓDULO CRON (Vigilancia 24/7)
// ==========================================
cron.schedule("*/5 * * * *", async () => {
  console.log("Ejecutando auditoría...", new Date().toLocaleTimeString());
  for (let user of users) {
    try {
      const data = await getInsights(user.accountId, user.token);
      if (data.spend === 0) continue;

      const alert = checkAlerts(data);
      
      // Alertas Críticas
      if (user.alerts && alert.type === "critical") {
        await sendEmail({
          email: user.email,
          message: `🚨 ALERTA CRÍTICA en ${user.accountName}: ${alert.message}`
        });
      }

      // Reporte Diario
      const now = new Date();
      const hourStr = now.toTimeString().slice(0,5);
      if (user.daily && user.hour === hourStr && user.lastReport !== hourStr) {
        user.lastReport = hourStr;
        let message = `📊 REPORTE DIARIO ADSALERT\n\n📢 ${user.accountName}\nGasto: $${data.spend}\nCTR: ${data.ctr}%\nFrecuencia: ${data.frequency}\n\n`;
        await sendEmail({ email: user.email, message });
      }
    } catch (e) {
      console.error(`Error al auditar cuenta ${user.accountId}:`, e.message);
    }
  }
});

// ==========================================
// 🚀 INICIO DEL SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 AdsAlert running on port ${PORT}`));
