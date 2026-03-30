const express = require("express");
const axios = require("axios");
const cors = require("cors");
const cron = require("node-cron");

const { getInsights, checkAlerts, generateInsights } = require("./meta");

const app = express();
app.use(cors());

// 🚀 ENDPOINT PRINCIPAL
app.get("/check", async (req, res) => {

  const token = req.query.token;

  if (!token) {
    return res.json({ error: "Falta token" });
  }

  try {

    // 🔹 1. TRAER CUENTAS
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

    // 🔹 2. RECORRER CUENTAS
    for (let acc of accounts) {

      const accountId = `act_${acc.account_id}`;

      try {

        // 🧠 3. VERIFICAR CAMPAÑAS ACTIVAS
        const campaignsRes = await axios.get(
          `https://graph.facebook.com/v19.0/${accountId}/campaigns`,
          {
            params: {
              fields: "status,effective_status",
              access_token: token
            }
          }
        );

        const hasActiveCampaigns = campaignsRes.data.data.some(c =>
          c.effective_status === "ACTIVE"
        );

        if (!hasActiveCampaigns) continue;

        // 📊 4. OBTENER MÉTRICAS
        const data = await getInsights(accountId, token);

        // 🚫 5. FILTRAR SIN ACTIVIDAD REAL
        const hasActivity =
          data.spend > 0 ||
          data.impressions > 0;

        if (!hasActivity) continue;

        // 🚨 6. ALERTAS
        const alert = checkAlerts(data);

        // 🧠 7. SIMULACIÓN COMPARATIVA (después mejoramos)
        const previous = {
          cpa: data.cpa * 0.9
        };

        // 🔥 8. INSIGHTS PRO
        const insights = generateInsights(data, previous);

        // 📦 9. PUSH FINAL
        response.push({
          name: acc.name,
          data,
          alert,
          insights
        });

      } catch (err) {
        console.log("Error cuenta:", acc.name);
        continue;
      }
    }

    // 🔥 ORDENAR POR GASTO (PRO)
    response.sort((a, b) => b.data.spend - a.data.spend);

    res.json(response);

  } catch (error) {
    console.error(error.message);
    res.json({ error: error.message });
  }
});

// ⏰ CRON DIARIO (base)
cron.schedule("0 10 * * *", () => {
  console.log("📊 Ejecutando monitoreo diario...");
});

// 🚀 SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🔥 AdsAlert corriendo en puerto " + PORT);
});