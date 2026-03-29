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
  token: "EAANFB0xZCBaUBRG3FnKZCNdjcNot3LLmuZC7A2SMdm2cRkCCoZAqZCMoAxd8ZBbYZAjJtbMYMSSqLZAKBrEKhVeHjqEFVS9wglGMYDO7FyuxmP73GwSczwZAdEZC5jGMBUmYFkqQ8UPsGZAI8E2W87Tr08VxOrROEDT4oXyF2GiiLx4owKOyBXplI7u2aoP4LYquyjQNv2ZAgDMJoeAvrkZC5KBZC6R6ZA3L9cRm754zpbz8ZC783lvdZBcJLf7G2x8dp9beGsZAjZB8T6jhMZBC2Rng2rafaVTuOCrh", // 🔥 reemplazar por tu token
  email: "lucjuarez@msn.com"
};

// 🧪 TEST
app.get("/", (req, res) => {
  res.send("🚨 AdsAlert funcionando");
});

// 🔍 ENDPOINT MULTICUENTAS
app.get("/check", async (req, res) => {
  try {
    const accounts = await getAdAccounts(config.token);

    let results = [];

    for (let acc of accounts) {

      const accountId = acc.id.replace("act_", "");

      // 🔥 SOLO cuentas con campañas activas
      const active = await hasActiveCampaigns(accountId, config.token);
      if (!active) continue;

      const data = await getInsights(accountId, config.token);
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

// 🔥 CRON AUTOMÁTICO (cada 10 min)
cron.schedule("*/10 * * * *", async () => {
  console.log("⏰ Ejecutando monitoreo...");

  try {
    const accounts = await getAdAccounts(config.token);

    for (let acc of accounts) {
      try {
        const accountId = acc.id.replace("act_", "");

        const active = await hasActiveCampaigns(accountId, config.token);
        if (!active) {
          console.log(`⏭️ ${acc.name} sin campañas activas`);
          continue;
        }

        const data = await getInsights(accountId, config.token);
        const alert = checkAlerts(data);

        console.log(`📊 ${acc.name}`, data);
        console.log(`🚨 ${acc.name}`, alert);

        const prev = lastStatus[acc.id];

        // 🧠 SOLO SI CAMBIA EL ESTADO
        if (alert.type !== prev) {
          lastStatus[acc.id] = alert.type;

          if (alert.type === "warning" || alert.type === "critical") {
            await sendEmail({
              message: `${acc.name}: ${alert.message}`,
              email: config.email
            });

            console.log(`📩 Email enviado: ${acc.name}`);
          }
        }

      } catch (error) {
        console.log(`❌ Error en ${acc.name}:`, error.message);
      }
    }

  } catch (error) {
    console.log("❌ Error general:", error.message);
  }
});

// 🚀 SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 AdsAlert corriendo en puerto ${PORT}`);
});