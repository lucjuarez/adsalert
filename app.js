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
// 📩 MÓDULO DE EMAIL (Lógica Original de Luciano)
// ==========================================
// Usamos las variables que configuraste en el panel de Render
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "mail.lucianojuarez.com.ar",
  port: parseInt(process.env.SMTP_PORT) || 465,
  secure: true, // SSL habilitado
  auth: {
    user: process.env.EMAIL_USER || "alertads@lucianojuarez.com.ar",
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false // Permite certificados del hosting sin bloquear la conexión
  }
});

async function sendEmail({ email, message, subject = "🚨 AdsAlert: Notificación" }) {
  console.log(`Intentando enviar email a: ${email}`);
  try {
    // Es vital que 'from' sea idéntico al 'user' de autenticación
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER || "alertads@lucianojuarez.com.ar",
      to: email,
      subject: subject,
      text: message
    });
    console.log("✅ Email enviado correctamente. Respuesta:", info.response);
  } catch (error) {
    console.error("❌ ERROR EN EL ENVÍO DE EMAIL:");
    console.error("Mensaje de error:", error.message);
    console.error("Código de error:", error.code);
  }
}

// ==========================================
// 📊 MÓDULO META (Extracción de Datos)
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
    
    // Si no hay inversión, no procesamos para evitar alertas vacías
    if (spend === 0) return null;

    const impressions = parseFloat(data.impressions || 0);
    const clicks = parseFloat(data.clicks || 0);
    const frequency = parseFloat(data.frequency || 0);
    
    let totalResults = 0;
    if (data.actions) {
      data.actions.forEach(a => {
        // Filtro de resultados principales: Compras, Leads y Mensajes
        if (a.action_type.includes("purchase") || a.action_type.includes("lead") || a.action_type.includes("messaging")) {
          totalResults += (parseInt(a.value) || 0);
        }
      });
    }

    const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : 0;
    const cpr = totalResults > 0 ? (spend / totalResults).toFixed(2) : 0;

    return { spend, totalResults, cpr, ctr, frequency: frequency.toFixed(2) };
  } catch (error) { 
    return null; 
  }
}

// ==========================================
// 🚀 ESCANEO INMEDIATO (El Dashboard por Mail)
// ==========================================
async function runInitialScan(userConfig) {
  console.log("Iniciando auditoría inmediata para:", userConfig.email);
  try {
    const accountsRes = await axios.get(
      `https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id,account_status&limit=100&access_token=${userConfig.token}`
    );
    const accounts = accountsRes.data.data || [];
    let reporteList = [];

    for (let acc of accounts) {
      // Solo auditamos cuentas con estado 1 (Activa)
      if (acc.account_status !== 1) continue;
      
      const accountId = `act_${acc.account_id}`;
      const metrics = await getAccountInsights(accountId, userConfig.token);
      
      if (metrics) {
        reporteList.push(`📌 ${acc.name}\nGastado: $${metrics.spend} | CPA: $${metrics.cpr} | CTR: ${metrics.ctr}% | Freq: ${metrics.frequency}\n`);
      }
    }

    let msg = `¡Hola!\n\nAdsAlert se ha conectado correctamente a tu perfil.\n\nEste es tu REPORTE DE ACTIVACIÓN con el estado de tus cuentas activas hoy:\n\n`;
    
    if (reporteList.length > 0) {
      msg += reporteList.join('\n');
    } else {
      msg += "No se detectaron cuentas con inversión activa en los últimos 7 días.\n";
    }
    
    msg += `\nEl sistema ahora monitoreará estos indicadores 24/7 de forma automática.\n\nSaludos,\nAdsAlert`;

    await sendEmail({ 
      email: userConfig.email, 
      subject: "✅ AdsAlert: Auditoría Multicuenta Activada", 
      message: msg 
    });
    
  } catch(e) {
    console.error("Error durante el escaneo inicial:", e.message);
  }
}

// ==========================================
// 🧠 ENDPOINTS DEL SERVIDOR
// ==========================================
let users = []; 

app.post("/save-config", (req, res) => {
  const { token, email, alerts, daily, hour } = req.body;
  const existingIndex = users.findIndex(u => u.email === email);
  const config = { token, email, alerts, daily, hour, lastReport: null };

  if (existingIndex >= 0) {
    users[existingIndex] = config;
  } else {
    users.push(config);
  }

  // Respuesta rápida al frontend para que el botón cambie a verde
  res.json({ status: "OK" });

  // Ejecución del reporte inicial por mail en segundo plano
  runInitialScan(config);
});

app.get("/health", (req, res) => {
    res.send("🚀 AdsAlert Backend Operativo");
});

// ==========================================
// ⏰ MÓDULO CRON (Vigilancia Silenciosa 24/7)
// ==========================================
cron.schedule("*/5 * * * *", async () => {
  console.log("Ejecutando revisión de portafolios...", new Date().toLocaleTimeString());
  
  for (let user of users) {
    try {
      const accountsRes = await axios.get(
        `https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id,account_status&limit=100&access_token=${user.token}`
      );
      const accounts = accountsRes.data.data || [];
      let reporteDiarioCuentas = [];

      for (let acc of accounts) {
        if (acc.account_status !== 1) continue;

        const metrics = await getAccountInsights(`act_${acc.account_id}`, user.token);
        if (!metrics) continue;

        // EVALUACIÓN DE ALERTAS ESTRATÉGICAS
        let alertasEncontradas = [];
        if (metrics.ctr > 0 && metrics.ctr < 1) alertasEncontradas.push(`CTR bajo (${metrics.ctr}%)`);
        if (metrics.frequency > 3) alertasEncontradas.push(`Frecuencia alta (${metrics.frequency})`);
        if (metrics.spend > 0 && metrics.totalResults === 0) alertasEncontradas.push(`Gasto sin conversiones registradas.`);

        // Si hay alertas y el usuario las tiene activas, enviamos mail crítico
        if (user.alerts && alertasEncontradas.length > 0) {
          await sendEmail({
            email: user.email,
            subject: `🚨 ALERTA DE RENDIMIENTO: ${acc.name}`,
            message: `AdsAlert ha detectado anomalías en "${acc.name}":\n\n${alertasEncontradas.map(a => "❌ " + a).join('\n')}\n\nCPA actual: $${metrics.cpr}\nInversión 7d: $${metrics.spend}`
          });
        }
        
        reporteDiarioCuentas.push(`📌 ${acc.name}\nCPA: $${metrics.cpr} | CTR: ${metrics.ctr}% | Freq: ${metrics.frequency}`);
      }

      // Lógica de Reporte Diario Consolidado
      const now = new Date();
      const hourStr = now.toTimeString().slice(0,5);
      
      if (user.daily && user.hour === hourStr && user.lastReport !== hourStr) {
        user.lastReport = hourStr;
        
        if (reporteDiarioCuentas.length > 0) {
          await sendEmail({ 
            email: user.email, 
            subject: "📊 AdsAlert: Resumen Diario de Portafolio", 
            message: `Este es el estado actual de todas tus cuentas activas:\n\n${reporteDiarioCuentas.join('\n\n')}\n\nEl monitoreo continúa activo.` 
          });
        }
      }
    } catch (e) {
      console.error(`Fallo en el proceso cron para ${user.email}:`, e.message);
    }
  }
});

// ==========================================
// 🚀 INICIO DEL SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 AdsAlert corriendo en puerto ${PORT}`);
});
