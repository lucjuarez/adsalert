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
// 📩 MÓDULO DE EMAIL (Con Fix para Hostinger)
// ==========================================
const transporter = nodemailer.createTransport({
  host: "mail.lucianojuarez.com.ar",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER || "alertads@lucianojuarez.com.ar",
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false // 🔥 Esto evita que Node.js bloquee el certificado de tu hosting
  }
});

async function sendEmail({ email, message, subject = "🚨 AdsAlert: Notificación del Sistema" }) {
  try {
    await transporter.sendMail({
      from: '"AdsAlert Global" <alertads@lucianojuarez.com.ar>',
      to: email,
      subject: subject,
      text: message
    });
    console.log(`Email enviado exitosamente a: ${email}`);
  } catch (error) {
    console.error("Error enviando email:", error.message);
  }
}

// ==========================================
// 📊 MÓDULO META (Data & Análisis Multicuenta)
// ==========================================
async function getAccountInsights(accountId, token) {
  try {
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
    if (spend === 0) return null; // Ignoramos si no gastó plata para no hacer ruido

    const impressions = parseFloat(data.impressions || 0);
    const clicks = parseFloat(data.clicks || 0);
    const frequency = parseFloat(data.frequency || 0);
    
    // Contar resultados (Compras + Leads + Mensajes)
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
  } catch (error) {
    return null; // Si hay error de API (ej. sin permisos o cuenta cerrada), saltamos la cuenta
  }
}

// ==========================================
// 🧠 ENDPOINTS
// ==========================================
let users = []; // Base de datos en memoria. Llave primaria: email

app.post("/save-config", (req, res) => {
  const { token, email, alerts, daily, hour } = req.body;
  
  // Guardamos por usuario/agencia
  const existingIndex = users.findIndex(u => u.email === email);
  const config = { token, email, alerts, daily, hour, lastReport: null };

  if (existingIndex >= 0) {
    users[existingIndex] = config;
  } else {
    users.push(config);
  }

  // 🔥 Email de Bienvenida / Confirmación
  sendEmail({ 
    email: email, 
    subject: "✅ AdsAlert: Auditoría Multicuenta Activada",
    message: `¡Hola!\n\nTu perfil de Meta ha sido conectado exitosamente.\nAdsAlert buscará y monitoreará de forma automática todas tus cuentas publicitarias activas.\n\nReglas de vigilancia:\n- Alertas Críticas (CTR < 1%, Frecuencia > 3, Gasto sin Resultados)\n- Reporte Diario Consolidado a las 08:00 AM.\n\nSaludos,\nSistema AdsAlert` 
  });

  res.json({ status: "OK" });
});

app.get("/health", (req, res) => {
    res.send("🚀 AdsAlert Backend Running OK");
});

// ==========================================
// ⏰ MÓDULO CRON (Auditoría Multicuenta 24/7)
// ==========================================
cron.schedule("*/5 * * * *", async () => {
  console.log("Iniciando escaneo de portafolios...", new Date().toLocaleTimeString());
  
  for (let user of users) {
    try {
      // 1. Obtener TODAS las cuentas a las que el usuario tiene acceso
      const accountsRes = await axios.get(
        `https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id,account_status&limit=100&access_token=${user.token}`
      );
      
      const accounts = accountsRes.data.data || [];
      let reporteDiarioCuentas = [];

      // 2. Iterar sobre cada cuenta
      for (let acc of accounts) {
        if (acc.account_status !== 1) continue; // 1 es Activa. Si está bloqueada o cerrada, la saltamos

        const accountId = `act_${acc.account_id}`;
        const metrics = await getAccountInsights(accountId, user.token);
        
        if (!metrics) continue; // Saltamos si no hubo inversión en los últimos 7 días

        // 3. Evaluación Estratégica de Alertas
        let problemas = [];
        if (metrics.ctr > 0 && metrics.ctr < 1) problemas.push(`CTR muy bajo (${metrics.ctr}%)`);
        if (metrics.frequency > 3) problemas.push(`Frecuencia alta indicando saturación (${metrics.frequency})`);
        if (metrics.spend > 0 && metrics.totalResults === 0) problemas.push(`Gasto continuo de $${metrics.spend} sin lograr conversiones (Leads/Compras/Msjs).`);

        // Disparo de Alerta Crítica (En tiempo real)
        if (user.alerts && problemas.length > 0) {
          await sendEmail({
            email: user.email,
            subject: `🚨 ALERTA CRÍTICA: ${acc.name}`,
            message: `Atención, hemos detectado problemas de rendimiento en la cuenta "${acc.name}":\n\n${problemas.map(p => "❌ " + p).join('\n')}\n\nMétricas de la cuenta (Últimos 7d):\nInversión: $${metrics.spend}\nCosto por Resultado: $${metrics.cpr}\nCTR: ${metrics.ctr}%\nFrecuencia: ${metrics.frequency}\n\nTe sugerimos revisar la campaña en el Administrador de Anuncios.`
          });
        }

        // 4. Acumular datos para el Reporte Diario
        reporteDiarioCuentas.push(`\n📌 ${acc.name}\nGastado: $${metrics.spend} | CPA: $${metrics.cpr} | CTR: ${metrics.ctr}% | Freq: ${metrics.frequency}`);
      }

      // 5. Envío del Reporte Diario Global
      const now = new Date();
      // Nota: La hora del servidor Render suele estar en UTC. 
      // Si querés que sea exacto a la hora de Argentina, lo ajustaremos luego.
      const hourStr = now.toTimeString().slice(0,5); 
      
      if (user.daily && user.hour === hourStr && user.lastReport !== hourStr) {
        user.lastReport = hourStr;
        
        if (reporteDiarioCuentas.length > 0) {
          let message = `📊 REPORTE DIARIO DE PORTAFOLIO\n\nResumen de todas tus cuentas activas en Meta Ads:\n${reporteDiarioCuentas.join('\n')}\n\nEl sistema continúa monitoreando en la nube.`;
          await sendEmail({ email: user.email, subject: "📊 AdsAlert: Resumen Diario", message });
        }
      }

    } catch (e) {
      console.error(`Error procesando portafolio de ${user.email}:`, e.message);
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Motor Multicuenta corriendo en puerto ${PORT}`));
