function checkAlerts(data) {
  const { spend, results, cpa } = data;

  // 🚨 Cuenta sin actividad
  if (spend === 0 && results === 0) {
    return {
      type: "warning",
      message: "⚠️ No hay actividad en la cuenta (campañas pausadas o sin presupuesto)"
    };
  }

  // 🚨 Gasto sin resultados
  if (spend > 0 && results === 0) {
    return {
      type: "critical",
      message: "🚨 Estás gastando dinero sin obtener resultados"
    };
  }

  // ✅ Todo OK
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