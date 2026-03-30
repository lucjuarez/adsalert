const axios = require("axios");

// 📊 OBTENER INSIGHTS DE META
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

  // 🔥 RESULTADOS CORRECTOS (TIPO METAREPORT)
  let results = 0;

  if (data.actions) {

    const map = {
      purchase: 0,
      lead: 0,
      message: 0,
      traffic: 0
    };

    data.actions.forEach(a => {
      const value = parseInt(a.value) || 0;

      if (a.action_type.includes("purchase")) map.purchase += value;
      if (a.action_type.includes("lead")) map.lead += value;
      if (a.action_type.includes("messaging")) map.message += value;
      if (a.action_type.includes("landing_page_view")) map.traffic += value;
    });

    // 🎯 PRIORIDAD INTELIGENTE
    results =
      map.purchase ||
      map.lead ||
      map.message ||
      map.traffic ||
      0;
  }

  const cpa = results > 0 ? spend / results : 0;

  // 📈 MÉTRICAS
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;

  return {
    spend,
    results,
    cpa,
    ctr: parseFloat(ctr.toFixed(2)),
    cpc: parseFloat(cpc.toFixed(2)),
    cpm: parseFloat(cpm.toFixed(2)),
    frequency
  };
}

// 🚨 ALERTAS BASE
function checkAlerts(data) {

  if (data.spend === 0 && data.results === 0) {
    return {
      type: "warning",
      message: "⚠️ Sin actividad"
    };
  }

  if (data.spend > 0 && data.results === 0) {
    return {
      type: "critical",
      message: "🚨 Gastando sin resultados"
    };
  }

  return {
    type: "ok",
    message: "✅ Campañas funcionando correctamente"
  };
}

// 🧠 INSIGHTS TIPO METAREPORT
function generateInsights(current, previous) {

  let insights = [];

  // CTR
  if (current.ctr < 1) {
    insights.push("🚨 CTR bajo → el creativo no está funcionando");
  } else if (current.ctr < 3) {
    insights.push("⚠️ CTR normal → se puede mejorar");
  } else {
    insights.push("✅ CTR alto → buen rendimiento creativo");
  }

  // FRECUENCIA
  if (current.frequency > 3) {
    insights.push("🚨 Frecuencia alta → saturación de audiencia");
  } else if (current.frequency > 2) {
    insights.push("⚠️ Fatiga en aumento");
  } else {
    insights.push("✅ Frecuencia saludable");
  }

  // COSTO
  if (previous && previous.cpa > 0) {
    if (current.cpa > previous.cpa * 1.2) {
      insights.push("🚨 Aumento del costo por resultado");
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