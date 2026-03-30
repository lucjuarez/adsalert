const express = require("express");
const axios = require("axios");
const cors = require("cors");
const cron = require("node-cron");

const { getInsights, checkAlerts, generateInsights } = require("./meta");
const { sendEmail } = require("./email");

const app = express();
app.use(cors());
app.use(express.json());

// 🧠 USUARIOS (memoria simple)
let users = [];

// 🔥 GUARDAR CONFIG
app.post("/save-config", (req, res) => {

  const { token, email, alerts, daily, hour } = req.body;

  users.push({
    token,
    email,
    alerts,
    daily,
    hour,
    lastReport: null
  });

  console.log("Nuevo usuario:", email);

  res.send("OK");
});

// 🚀 CHECK MANUAL (para front)
app.get("/check", async (req, res) => {

  const token = req.query.token;

  if (!token) {
    return res.json({ error: "Falta token" });
  }

  try {

    const accountsRes = await axios.get(
      "https://graph.facebook.com/v19.0/me/adaccounts",
      {
        params: {
          fields: "name,account_id",
          limit: 200,
          access_token: token
        }
      }
    );

    const accounts = accountsRes.data.data;

    let response = [];

    for (let acc of accounts) {

      const accountId = `act_${acc.account_id}`;

      try {

        // 🔎 CAMPAÑAS ACTIVAS
        const campaignsRes = await axios.get(
          `https://graph.facebook.com/v19.0/${accountId}/campaigns`,
          {
            params: {
              fields: "effective_status",
              access_token: token
            }
          }
        );

        const active = campaignsRes.data.data.some(c =>
          c.effective_status === "ACTIVE"
        );

        if (!active) continue;

        // 📊 DATA
        const data = await getInsights(accountId, token);

        if (data.spend === 0 && data.mainResult === 0) continue;

        const alert = checkAlerts(data);

        const previous = {
          cpa: data.cpa * 0.9
        };

        const insights = generateInsights(data, previous);

        response.push({
          name: acc.name,
          data,
          alert,
          insights
        });

      } catch (err) {
        continue;
      }
    }

    // 🔥 ordenar por gasto
    response.sort((a, b) => b.data.spend - a.data.spend);

    res.json(response);

  } catch (error) {
    res.json({ error: error.message });
  }
});

// 🔥 CRON AUTOMÁTICO (cada 5 min)
cron.schedule("*/5 * * * *", async () => {

  console.log("⏰ Ejecutando monitoreo...");

  const now = new Date();
  const currentHour = now.toTimeString().slice(0,5);

  for (let user of users) {

    try {

      const accountsRes = await axios.get(
        "https://graph.facebook.com/v19.0/me/adaccounts",
        {
          params: {
            fields: "name,account_id",
            access_token: user.token
          }
        }
      );

      const accounts = accountsRes.data.data;

      let report = [];

      for (let acc of accounts) {

        const accountId = `act_${acc.account_id}`;

        try {

          const campaignsRes = await axios.get(
            `https://graph.facebook.com/v19.0/${accountId}/campaigns`,
            {
              params: {
                fields: "effective_status",
                access_token: user.token
              }
            }
          );

          const active = campaignsRes.data.data.some(c =>
            c.effective_status === "ACTIVE"
          );

          if (!active) continue;

          const data = await getInsights(accountId, user.token);

          if (data.spend === 0 && data.mainResult === 0) continue;

          const alert = checkAlerts(data);

          const previous = {
            cpa: data.cpa * 0.9
          };

          const insights = generateInsights(data, previous);

          report.push({
            name: acc.name,
            data,
            alert,
            insights
          });

          // 🚨 ALERTA CRÍTICA
          if (user.alerts && alert.type === "critical") {

            await sendEmail({
              email: user.email,
              message: `🚨 ${acc.name}: ${alert.message}`
            });

            console.log("📩 alerta enviada a", user.email);
          }

        } catch (err) {
          continue;
        }
      }

      // 📊 REPORTE DIARIO
      if (user.daily && user.hour === currentHour && user.lastReport !== currentHour) {

        user.lastReport = currentHour;

        let message = "📊 REPORTE ADS ALERT\n\n";

        report.forEach(r => {

          const d = r.data;

          message += `
📢 ${r.name}
Resultados: ${d.mainResult}
Gasto: $${d.spend}
CPA: $${d.cpa.toFixed(2)}
CTR: ${d.ctr}%
Frecuencia: ${d.frequency.toFixed(2)}

🛒 ${d.results.purchases} | 📩 ${d.results.leads} | 💬 ${d.results.messages}

------------------------
`;
        });

        await sendEmail({
          email: user.email,
          message
        });

        console.log("📩 reporte enviado a", user.email);
      }

    } catch (error) {
      console.log("error usuario:", user.email);
    }
  }

});

// 🚀 SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🔥 AdsAlert corriendo en puerto " + PORT);
});