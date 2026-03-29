const express = require("express");
const cron = require("node-cron");
const cors = require("cors");

const { sendEmail } = require("./email");
const { getInsights, getAdAccounts, hasActiveCampaigns } = require("./meta");
const { checkAlerts } = require("./alerts");

const app = express();
app.use(cors());

// 🧠 MEMORIA ANTI-SPAM
let lastStatus = {};

// 🔐 CONFIG
const config = {
  token: "EAANFB0xZCBaUBRG3FnKZCNdjcNot3LLmuZC7A2SMdm2cRkCCoZAqZCMoAxd8ZBbYZAjJtbMYMSSqLZAKBrEKhVeHjqEFVS9wglGMYDO7FyuxmP73GwSczwZAdEZC5jGMBUmYFkqQ8UPsGZAI8E2W87Tr08VxOrROEDT4oXyF2GiiLx4owKOyBXplI7u2aoP4LYquyjQNv2ZAgDMJoeAvrkZC5KBZC6R6ZA3L9cRm754zpbz8ZC783lvdZBcJLf7G2x8dp9beGsZAjZB8T6jhMZBC2Rng2rafaVTuOCrh",
  email: "lucjuarez@msn.com"
};

// 🧪 TEST
app.get("/", (req, res) => {
  res.send("🚨 AdsAlert funcionando");
});

// 🔍 MULTICUENTAS
app.get("/check", async (req, res) => {
  try {
    const accounts = await getAdAccounts(config.token);

    let results = [];

    for (let acc of accounts) {

      const accountId = acc.account_id;

      // 🔥 SOLO ACTIVAS
      const active = await hasActiveCampaigns(accountId, config.token);
      if (!active) continue;

      const data = await getInsights(accountId, config.token);

      // 🔥 FILTRO EXTRA (evita ruido)
      if (data.spend < 1) continue;

      const alert = checkAlerts(data);

      results.push({
        name: acc.name,
        data,
        alert
      });
    }

    res.json(results);

  } catch (error) {
    res.json({
      error: error.response?.data || error.message
    });
  }
});

// 🔥 CRON
cron.schedule("*/10 * * * *", async () => {
  console.log("⏰ Monitoreo...");

  try {
    const accounts = await getAdAccounts(config.token);

    for (let acc of accounts) {
      try {
        const accountId = acc.account_id;

        const active = await hasActiveCampaigns(accountId, config.token);
        if (!active) continue;

        const data = await getInsights(accountId, config.token);
        if (data.spend < 1) continue;

        const alert = checkAlerts(data);

        const prev = lastStatus[acc.account_id];

        if (alert.type !== prev) {
          lastStatus[acc.account_id] = alert.type;

          if (alert.type === "warning" || alert.type === "critical") {
            await sendEmail({
              message: `${acc.name}: ${alert.message}`,
              email: config.email
            });
          }
        }

      } catch (err) {
        console.log("Error cuenta:", err.message);
      }
    }

  } catch (err) {
    console.log("Error general:", err.message);
  }
});

// 🚀 SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server en puerto ${PORT}`);
});