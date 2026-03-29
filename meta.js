const axios = require("axios");

// 📊 OBTENER MÉTRICAS
async function getInsights(accountId, token) {
  const url = `https://graph.facebook.com/v19.0/act_${accountId}/insights`;

  const res = await axios.get(url, {
    params: {
      fields: "spend,actions",
      date_preset: "last_7d",
      access_token: token,
    },
  });

  const data = res.data.data[0] || {};

  const spend = parseFloat(data.spend || 0);

  // 🔥 RESULTADOS PRO (tipo MetaReport)
  let results = 0;

  if (data.actions) {
    const importantActions = [
      "purchase",
      "omni_purchase",
      "offsite_conversion.fb_pixel_purchase",
      "lead",
      "onsite_conversion.lead",
      "messaging_conversation_started_7d",
      "landing_page_view"
    ];

    for (let action of data.actions) {
      if (importantActions.includes(action.action_type)) {
        results += parseInt(action.value);
      }
    }
  }

  const cpa = results > 0 ? spend / results : 0;

  return { spend, results, cpa };
}

// 📊 OBTENER CUENTAS PUBLICITARIAS
async function getAdAccounts(token) {
  const url = `https://graph.facebook.com/v19.0/me/adaccounts`;

  const res = await axios.get(url, {
    params: {
      fields: "name,account_id",
      access_token: token
    }
  });

  return res.data.data;
}

// 🔥 VALIDAR CAMPAÑAS ACTIVAS (REAL)
async function hasActiveCampaigns(accountId, token) {
  const url = `https://graph.facebook.com/v19.0/act_${accountId}/campaigns`;

  const res = await axios.get(url, {
    params: {
      fields: "effective_status",
      access_token: token
    }
  });

  const campaigns = res.data.data;

  return campaigns.some(c => c.effective_status === "ACTIVE");
}

module.exports = {
  getInsights,
  getAdAccounts,
  hasActiveCampaigns
};