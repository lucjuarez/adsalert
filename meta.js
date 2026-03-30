const axios = require("axios");

// 📊 INSIGHTS META
async function getInsights(accountId, token) {

  const url = `https://graph.facebook.com/v19.0/${accountId}/insights`;

  const res = await axios.get(url, {
    params: {
      fields: "spend,impressions,clicks,actions,frequency",
      date_preset: "last_7d",
      access_token: token
    }
  });

  const data = res.data.data[0] || {};

  const spend = parseFloat(data.spend || 0);
  const impressions = parseFloat(data.impressions || 0);
  const clicks = parseFloat(data.clicks || 0);
  const frequency = parseFloat(data.frequency || 0);

  // 🔥 RESULTADOS POR TIPO (CLAVE)
  let results = {
    purchases: 0,
    leads: 0,
    messages: 0,
    traffic: 0
  };

  if (data.actions) {
    data.actions.forEach(a => {
      const value = parseInt(a.value) || 0;

      if (a.action_type.includes("purchase")) {
        results.purchases += value;
      }

      if (a.action_type.includes("lead")) {
        results.leads += value;
      }

      if (a.action_type.includes("messaging")) {
        results.messages += value;
      }

      if (a.action_type.includes("landing_page_view")) {
        results.traffic += value;
      }
    });
  }

  // 🎯 RESULTADO PRINCIPAL (prioridad tipo MetaReport)
  const mainResult =
    results.purchases ||
    results.leads ||
    results.messages ||
    results.traffic ||
    0;

  const cpa = mainResult > 0 ? spend / mainResult : 0;

  // 📈 MÉTRICAS
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;

  return {
    spend,
    results,
    mainResult,
    cpa,
    ctr: parseFloat(ctr.toFixed(2)),
    cpc: parseFloat(cpc.toFixed(2)),
    cpm: parseFloat(cpm.toFixed(2)),
    frequency
  };
}

// 🚨 ALERTAS
function checkAlerts(data) {

  if (data.spend === 0 && data.mainResult === 0) {
    return { type: "warning", message: "⚠️ Sin actividad" };
  }

  if (data.spend > 0 && data.mainResult === 0) {
    return { type: "critical", message: "🚨 Gastando sin resultados" };
  }

  return { type: "ok", message: "✅ Campañas funcionando" };
}

// 🧠 INSIGHTS
function generateInsights(current, previous) {

  let insights = [];

  // CTR
  if (current.ctr < 1) {
    insights.push("🚨 CTR bajo → creativo débil");
  } else if (current.ctr < 3) {
    insights.push("⚠️ CTR normal → mejorar anuncios");
  } else {
    insights.push("✅ CTR alto");
  }

  // FRECUENCIA
  if (current.frequency > 3) {
    insights.push("🚨 Saturación de audiencia");
  } else if (current.frequency > 2) {
    insights.push("⚠️ Fatiga en aumento");
  } else {
    insights.push("✅ Frecuencia saludable");
  }

  // COSTOS
  if (previous && previous.cpa > 0) {
    if (current.cpa > previous.cpa * 1.2) {
      insights.push("🚨 Subida de costos");
    } else if (current.cpa < previous.cpa) {
      insights.push("✅ Mejora en costos");
    } else {
      insights.push("⚠️ Costos estables");
    }
  }

  return insights;
}

module.exports = {
  getInsights,
  checkAlerts,
  generateInsights
};