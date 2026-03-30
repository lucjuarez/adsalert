const axios = require("axios");

// 🔥 OBTENER CUENTAS
async function getAdAccounts(token) {
  const res = await axios.get("https://graph.facebook.com/v19.0/me/adaccounts", {
    params: {
      fields: "name,account_id",
      access_token: token
    }
  });

  return res.data.data;
}

// 🔥 DETECTAR CAMPAÑAS ACTIVAS
async function hasActiveCampaigns(accountId, token) {
  try {
    const res = await axios.get(`https://graph.facebook.com/v19.0/act_${accountId}/campaigns`, {
      params: {
        fields: "status",
        access_token: token
      }
    });

    return res.data.data.some(c => c.status === "ACTIVE");

  } catch (e) {
    return false;
  }
}

// 🔥 INSIGHTS (ESTILO METAREPORT)
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

  let results = 0;

  if (data.actions) {

    const priority = [
      "purchase",
      "offsite_conversion.purchase",
      "lead",
      "onsite_conversion.lead_grouped",
      "messaging_conversation_started_7d",
      "landing_page_view",
      "link_click"
    ];

    for (let type of priority) {
      const found = data.actions.find(a => a.action_type === type);
      if (found) {
        results = parseInt(found.value);
        break;
      }
    }
  }

  const cpa = results > 0 ? spend / results : 0;

  return { spend, results, cpa };
}

module.exports = {
  getAdAccounts,
  getInsights,
  hasActiveCampaigns
};