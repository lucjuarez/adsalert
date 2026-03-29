const express = require("express");
const cors = require("cors");

const { getInsights, getAdAccounts, hasActiveCampaigns } = require("./meta");
const { checkAlerts } = require("./alerts");

const app = express();
app.use(cors());

// TEST
app.get("/", (req, res) => {
  res.send("AdsAlert funcionando");
});

// 🔥 ENDPOINT MULTIUSUARIO
app.get("/check", async (req, res) => {
  try {

    const token = req.query.token;

    if (!token) {
      return res.json({ error: "Token requerido" });
    }

    const accounts = await getAdAccounts(token);

    let results = [];

    for (let acc of accounts) {

      const accountId = acc.account_id;

      const active = await hasActiveCampaigns(accountId, token);
      if (!active) continue;

      const data = await getInsights(accountId, token);
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
    console.log(error);
    res.json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto " + PORT);
});