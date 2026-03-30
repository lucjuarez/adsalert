const axios = require("axios");

// 🔥 CUENTAS
async function getAdAccounts(token) {
  const res = await axios.get("https://graph.facebook.com/v19.0/me/adaccounts", {
    params: {
      fields: "name,account_id",
      access_token: token
    }
  });

  return res.data.data;
}

// 🔥 CAMPAÑAS ACTIVAS
async function hasActiveCampaigns(accountId, token) {
  try {
    const res = await axios.get(`https://graph.facebook.com/v19.0/act_${accountId}/campaigns`, {
      params: {
        fields: "effective_status",
        access_token: token
      }
    });

    return res.data.data.some(c => c.effective_status === "ACTIVE");

  } catch {
    return false;
  }
}

// 🔥 INSIGHTS INTELIGENTE (TIPO METAREPORT)
async function getInsights(accountId, token) {
  const res = await axios.get(`https://graph.facebook.com/v19.0/act_${accountId}/insights`, {
    params: {
      fields: "spend,impressions,clicks,actions,cpm,ctr",
      date_preset: "last_7d",
      access_token: token
    }
  });

  const data = res.data.data[0] || {};

  const spend = parseFloat(data.spend || 0);
  const impressions = parseInt(data.impressions || 0);
  const clicks = parseInt(data.clicks || 0);
  const ctr = parseFloat(data.ctr || 0);
  const cpm = parseFloat(data.cpm || 0);

  let objective = "traffic";
  let results = 0;

  if (data.actions) {

    const map = {
      purchase: ["purchase", "offsite_conversion.purchase"],
      lead: ["lead", "onsite_conversion.lead_grouped"],
      message: ["messaging_conversation_started_7d"],
      traffic: ["landing_page_view", "link_click"]
    };

    for (let key in map) {
      for (let type of map[key]) {
        const found = data.actions.find(a => a.action_type === type);
        if (found) {
          objective = key;
          results = parseInt(found.value);
          break;
        }
      }
    }
  }

  const cpa = results > 0 ? spend / results : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;

  return {
    spend,
    results,
    cpa,
    cpc,
    ctr,
    cpm,
    impressions,
    clicks,
    objective
  };
}

module.exports = {
  getAdAccounts,
  getInsights,
  hasActiveCampaigns
};