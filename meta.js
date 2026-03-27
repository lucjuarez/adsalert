const axios = require("axios");

async function getInsights(accountId, token) {
  const url = `https://graph.facebook.com/v19.0/act_${accountId}/insights`;

  const res = await axios.get(url, {
    params: {
      fields: "spend,impressions,clicks,actions",
      date_preset: "yesterday",
      access_token: token,
    },
  });

  const data = res.data.data[0] || {};

  const spend = parseFloat(data.spend || 0);

  let results = 0;

  // 🔥 Detecta múltiples tipos de resultados
  if (data.actions) {
    const actionsPriority = [
      "purchase",
      "lead",
      "messaging_conversation_started_7d",
      "landing_page_view"
    ];

    for (let type of actionsPriority) {
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

module.exports = { getInsights };