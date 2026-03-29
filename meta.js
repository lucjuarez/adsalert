const axios = require("axios");

// 📊 MÉTRICAS
async function getInsights(accountId, token) {
  try {
    const url = `https://graph.facebook.com/v19.0/act_${accountId}/insights`;

    const res = await axios.get(url, {
      params: {
        fields: "spend,impressions,clicks,actions",
        date_preset: "last_7d",
        access_token: token,
      },
    });

    const data = res.data.data[0] || {};

    const spend = parseFloat(data.spend || 0);

    let results = 0;

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

  } catch (error) {
    console.log("❌ Error en Meta Insights:", error.response?.data || error.message);

    return {
      spend: 0,
      results: 0,
      cpa: 0,
      error: true
    };
  }
}

// 📋 TODAS LAS CUENTAS
async function getAdAccounts(token) {
  try {
    const res = await axios.get("https://graph.facebook.com/v19.0/me/adaccounts", {
      params: {
        fields: "id,name,account_status",
        access_token: token
      }
    });

    // 🔥 SOLO cuentas activas
    return res.data.data.filter(acc => acc.account_status === 1);

  } catch (error) {
    console.log("❌ Error obteniendo cuentas:", error.response?.data || error.message);
    return [];
  }
}

// 🚀 DETECTAR CAMPAÑAS ACTIVAS
async function hasActiveCampaigns(accountId, token) {
  try {
    const res = await axios.get(`https://graph.facebook.com/v19.0/act_${accountId}/campaigns`, {
      params: {
        fields: "status",
        access_token: token
      }
    });

    return res.data.data.some(c => c.status === "ACTIVE");

  } catch (error) {
    console.log("❌ Error campañas:", error.response?.data || error.message);
    return false;
  }
}

module.exports = {
  getInsights,
  getAdAccounts,
  hasActiveCampaigns
};