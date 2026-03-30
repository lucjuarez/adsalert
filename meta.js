function calcularMetricas(data){

  const spend = parseFloat(data.spend || 0);
  const impressions = parseFloat(data.impressions || 0);
  const clicks = parseFloat(data.clicks || 0);

  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
  const frequency = data.frequency || 0;

  return { ctr, cpc, cpm, frequency };
}

// 🔥 ALERTAS PRO (tipo MetaReport)
function generarAlertasPro(current, previous){

  let insights = [];

  // 🚨 CTR
  if(current.ctr < 1){
    insights.push("🚨 CTR bajo → el creativo no está llamando la atención");
  } else if(current.ctr < 3){
    insights.push("⚠️ CTR normal → se puede mejorar el creativo");
  } else {
    insights.push("✅ CTR bueno → los anuncios están funcionando");
  }

  // 🚨 FRECUENCIA
  if(current.frequency > 3){
    insights.push("🚨 Frecuencia alta → saturación de audiencia");
  } else if(current.frequency > 2){
    insights.push("⚠️ Frecuencia en aumento → vigilar fatiga");
  } else {
    insights.push("✅ Frecuencia saludable");
  }

  // 🚨 COSTOS (comparación)
  if(previous){
    if(current.cpa > previous.cpa * 1.2){
      insights.push("🚨 El costo por resultado está subiendo");
    } else if(current.cpa < previous.cpa){
      insights.push("✅ El costo por resultado está mejorando");
    }
  }

  return insights;
}

module.exports = {
  calcularMetricas,
  generarAlertasPro
};