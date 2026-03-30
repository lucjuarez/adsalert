const express = require("express");
const cors = require("cors");
const cron = require("node-cron");

const { getInsights, getAdAccounts, hasActiveCampaigns } = require("./meta");
const { checkAlerts } = require("./alerts");
const { sendEmail } = require("./email");

const app = express();
app.use(cors());
app.use(express.json());

let users = [];

// 🧠 GUARDAR CONFIG
app.post("/save-config", (req, res) => {

  const { token, email, hour, alerts } = req.body;

  users.push({
    token,
    email,
    hour,
    alerts,
    lastReport: null
  });

  res.send("OK");
});

// 🔍 CHECK
app.get("/check", async (req, res) => {
  try {

    const token = req.query.token;
    const accounts = await getAdAccounts(token);

    let results = [];

    for (let acc of accounts) {

      const id = acc.account_id;

      const active = await hasActiveCampaigns(id, token);
      if (!active) continue;

      const data = await getInsights(id, token);
      if (data.spend < 1) continue;

      const alert = checkAlerts(data);

      results.push({
        name: acc.name,
        data,
        alert
      });
    }

    res.json(results);

  } catch (e) {
    res.json({ error: e.message });
  }
});

// 🔥 CRON INTELIGENTE
cron.schedule("* * * * *", async () => {

  const now = new Date();
  const currentHour = now.toTimeString().slice(0,5);

  for (let user of users) {

    try {

      const accounts = await getAdAccounts(user.token);
      let report = [];

      for (let acc of accounts) {

        const id = acc.account_id;

        const active = await hasActiveCampaigns(id, user.token);
        if (!active) continue;

        const data = await getInsights(id, user.token);
        if (data.spend < 1) continue;

        const alert = checkAlerts(data);

        report.push({ name: acc.name, data, alert });

        // 🚨 ALERTA CRÍTICA
        if (alert.type === "critical" && user.alerts) {
          await sendEmail({
            email: user.email,
            message: `🚨 ${acc.name}: ${alert.message}`
          });
        }
      }

      // 📊 REPORTE DIARIO
      if (user.hour === currentHour && user.lastReport !== currentHour) {

        user.lastReport = currentHour;

        let message = "📊 REPORTE DIARIO:\n\n";

        report.forEach(r => {

          const d = r.data;

          message += `📢 ${r.name}\n`;

          if (d.objective === "purchase") {
            message += `🛒 Ventas: ${d.results}\n💰 $${d.spend}\nCPA: $${d.cpa.toFixed(2)}\nCTR: ${d.ctr}%\nIMP: ${d.impressions}\nCPM: $${d.cpm}\n\n`;
          }

          if (d.objective === "lead") {
            message += `📩 Leads: ${d.results}\n💰 $${d.spend}\nCPL: $${d.cpa.toFixed(2)}\nCTR: ${d.ctr}%\nClicks: ${d.clicks}\nCPC: $${d.cpc.toFixed(2)}\n\n`;
          }

          if (d.objective === "message") {
            message += `💬 Mensajes: ${d.results}\n💰 $${d.spend}\nCosto: $${d.cpa.toFixed(2)}\nCTR: ${d.ctr}%\nClicks: ${d.clicks}\nCPC: $${d.cpc.toFixed(2)}\n\n`;
          }

          if (d.objective === "traffic") {
            message += `🌐 Visitas: ${d.results}\n💰 $${d.spend}\nCPC: $${d.cpc.toFixed(2)}\nCTR: ${d.ctr}%\nIMP: ${d.impressions}\nCPM: $${d.cpm}\n\n`;
          }

          message += "----------------------\n";
        });

        await sendEmail({
          email: user.email,
          message
        });

        console.log("📩 Reporte enviado");
      }

    } catch (e) {
      console.log("error", e.message);
    }

  }

});

// SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Running " + PORT));