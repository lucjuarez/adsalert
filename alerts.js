function checkAlerts(data) {
  const { spend, results } = data;

  if (spend === 0 && results === 0) {
    return {
      type: "warning",
      message: "⚠️ No hay actividad en la cuenta (campañas pausadas o sin presupuesto)"
    };
  }

  if (spend > 0 && results === 0) {
    return {
      type: "critical",
      message: "🚨 Estás gastando dinero sin obtener resultados"
    };
  }

  if (spend > 0 && results > 0) {
    return {
      type: "ok",
      message: "✅ Tus campañas están funcionando correctamente"
    };
  }

  return {
    type: "info",
    message: "ℹ️ Sin datos suficientes"
  };
}

module.exports = { checkAlerts };