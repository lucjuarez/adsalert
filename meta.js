const axios = require("axios");

// 🔥 CONSTRUIR RESULTADOS POR TIPO
function buildResults(data) {

  let resultTypes = {
    purchase: 0,
    lead: 0,
    message: 0,
    traffic: 0
  };

  if (data.actions) {
    data.actions.forEach(a => {
      const value = parseInt(a.value) || 0;

      if (a.action_type.includes("purchase")) {
        resultTypes.purchase += value;
      }

      if (a.action_type.includes("lead")) {
        resultTypes.lead += value;
      }

      if (a.action_type.includes("messaging")) {
        resultTypes.message += value;
      }

      if (a.action_type.includes("landing_page_view")) {
        resultTypes.traffic += value;
      }
    });
  }

  return resultTypes;
}

// 🔥 ARMAR BLOQUES POR OBJETIVO
function buildObjectiveData(results, spend) {

  let output = [];

  if (results.purchase > 0) {
    output.push({
      type: "purchase",
      label: "🛒 Compras",
      results: results.purchase,
      cost: spend / results.purchase
    });
  }

  if (results.lead > 0) {
    output.push({
      type: "lead",
      label: "📩 Leads",
      results: results.lead,
      cost: spend / results.lead
    });
  }

  if (results.message > 0) {
    output.push({
      type: "message",
      label: "💬 Mensajes",
      results: results.message,
      cost: spend / results.message
    });
  }

  if (results.traffic > 0) {
    output.push({
      type: "traffic",
      label: "🌐 Tráfico",
      results: results.traffic,
      cost: spend / results.traffic
    });
  }

  return output;
}

// 📊 INSIGHTS
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

  // 🔥 RESULTADOS MULTI
  const results = buildResults(data);
  const objectives = buildObjectiveData(results, spend);

  // 📈 MÉTRICAS
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;

  return {
    spend,
    objectives,
    ctr: parseFloat(ctr.toFixed(2)),
    cpc: parseFloat(cpc.toFixed(2)),
    cpm: parseFloat(cpm.toFixed(2)),
    frequency
  };
}

// 🚨 ALERTAS
function checkAlerts(data) {

  if (data.spend === 0) {
    return { type: "warning", message: "⚠️ Sin inversión" };
  }

  if (data.objectives.length === 0) {
    return { type: "critical", message: "🚨 Sin resultados" };
  }

  return { type: "ok", message: "✅ Funcionando" };
}

// 🧠 INSIGHTS PRO
function generateInsights(data) {

  let insights = [];

  if (data.ctr < 1) insights.push("🚨 CTR bajo");
  else if (data.ctr < 3) insights.push("⚠️ CTR normal");
  else insights.push("✅ CTR alto");

  if (data.frequency > 3) insights.push("🚨 Saturación");
  else if (data.frequency > 2) insights.push("⚠️ Fatiga");
  else insights.push("✅ Frecuencia saludable");

  return insights;
}

module.exports = {
  getInsights,
  checkAlerts,
  generateInsights
};