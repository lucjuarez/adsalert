const express = require("express");
const axios = require("axios");
const cors = require("cors");

const { getInsights, checkAlerts, generateInsights } = require("./meta");

const app = express();
app.use(cors());

// 🔍 ENDPOINT
app.get("/check", async (req, res) => {

  const token = req.query.token;

  try {

    const accountsRes = await axios.get(
      "https://graph.facebook.com/v19.0/me/adaccounts",
      {
        params: {
          fields: "name,account_id",
          access_token: token
        }
      }
    );

    const accounts = accountsRes.data.data;

    const promises = accounts.map(async acc => {

      const accountId = `act_${acc.account_id}`;

      try {

        const data = await getInsights(accountId, token);

        if (data.spend === 0) return null;

        const alert = checkAlerts(data);
        const insights = generateInsights(data);

        return {
          name: acc.name,
          data,
          alert,
          insights
        };

      } catch {
        return null;
      }
    });

    const results = await Promise.all(promises);

    res.json(results.filter(r => r));

  } catch (e) {
    res.json({ error: e.message });
  }
});

app.listen(3000, () => {
  console.log("🚀 Server listo");
});