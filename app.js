const express = require("express");
const axios = require("axios");
const cors = require("cors");
const cron = require("node-cron");
const { sendEmail } = require("./email");

const app = express();
app.use(cors());

// 🧠 MEMORIA
let lastStatus = {};

// 📊 OBTENER DATA META
async function getInsights(accountId, token) {
  const url = `https://graph.facebook.com/v19.0/${accountId}/insights`;

  const res = await axios.get(url, {
    params: {
      fields: "spend,impressions,clicks,actions,frequency",
      date_preset: "last_7d",
      access_token: token,
    },
  });

  const data = res.data.data[0] || {};

  const spend = parseFloat(data.spend || 0);
  const impressions = parseFloat(data.impressions || 0);
  const clicks = parseFloat(data.clicks || 0);
  const frequency = parseFloat(data.frequency || 0);

  let results = 0;

  if (data.actions) {
    const priorities = [
      "purchase",
      "lead",
      "messaging_conversation_started_7d",
      "landing_page_view"
    ];

    for (let type of priorities) {
      const found = data.actions.find(a => a.action_type === type);
      if (found) {
        results = parseInt(found.value);
        break;
      }
    }
  }

  const cpa = results > 0 ? spend / results : 0;

  // 🔥 MÉTRICAS
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;

  return {
    spend,
    results,
    cpa,
    ctr: ctr.toFixed(2),
    cpc: cpc.toFixed(2),
    cpm: cpm.toFixed(2),
    frequency
  };
}

// 🚨 ALERTAS BASE
function checkAlerts(data) {
  if (data.spend === 0 && data.results === 0) {
    return { type: "warning", message: "⚠️ Sin actividad" };
  }

  if (data.spend > 0 && data.results === 0) {
    return { type: "critical", message: "🚨 Gastando sin resultados" };
  }

  return { type: "ok", message: "✅ Campañas funcionando" };
}

// 🧠 INSIGHTS PRO
function generateInsights(current, previous) {

  let insights = [];

  // CTR
  if (current.ctr < 1) {
    insights.push("🚨 CTR bajo → creativo débil");
  } else if (current.ctr < 3) {
    insights.push("⚠️ CTR normal → se puede mejorar");
  } else {
    insights.push("✅ CTR alto → buen anuncio");
  }

  // FRECUENCIA
  if (current.frequency > 3) {
    insights.push("🚨 Frecuencia alta → saturación");
  } else if (current.frequency > 2) {
    insights.push("⚠️ Fatiga en aumento");
  } else {
    insights.push("✅ Frecuencia saludable");
  }

  // COSTOS
  if (previous && current.cpa > previous.cpa * 1.2) {
    insights.push("🚨 Subió el costo por resultado");
  } else {
    insights.push("✅ Costos estables");
  }

  return insights;
}

// 🔍 ENDPOINT PRINCIPAL
app.get("/check", async (req, res) => {

  const token = req.query.token;

  try {

    // obtener cuentas
    const accountsRes = await axios.get(
      `https://graph.facebook.com/v19.0/me/adaccounts`,
      {
        params: {
          fields: "name,account_id",
          access_token: token
        }
      }
    );

    const accounts = accountsRes.data.data;

    let response = [];

    for (let acc of accounts) {

      const accountId = `act_${acc.account_id}`;

      const data = await getInsights(accountId, token);
      const alert = checkAlerts(data);

      const previous = {
        cpa: data.cpa * 0.9
      };

      const insights = generateInsights(data, previous);

      response.push({
        name: acc.name,
        data,
        alert,
        insights
      });
    }

    res.json(response);

  } catch (error) {
    res.json({ error: error.message });
  }
});

// 🔥 CRON
cron.schedule("0 10 * * *", () => {
  console.log("📊 Reporte diario ejecutado");
});

// 🚀 SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Server listo");
});