function checkAlerts(data) {

  if (data.spend === 0) {
    return { type: "warning", message: "Sin inversión activa" };
  }

  if (data.results === 0) {
    return { type: "critical", message: "Gasta sin resultados" };
  }

  if (data.cpa > 50 && data.objective !== "traffic") {
    return { type: "warning", message: "CPA elevado" };
  }

  return { type: "ok", message: "Funcionando correctamente" };
}

module.exports = { checkAlerts };