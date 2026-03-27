const express = require("express");
const axios = require("axios");
const cron = require("node-cron");
const { sendEmail } = require("./email");

const app = express();

// 🧠 MEMORIA DE ESTADOS (ANTI-SPAM)
let lastStatus = {};

// 🧠 MULTICUENTAS
const accounts = [
  {
    name: "Cuenta Luciano",
    account_id: "573798197933238",
    token: "EAANFB0xZCBaUBROkuxcGj1N1uZB5LqvNbmpaH0oFkp2wKEJg2qJ7Yx0mlFVlToxt3mzjGf461PtjeHqjzhsk4jBceAOX5jqTakOnzdxQp2uuijE8PTZAGTPHdm1GEWHNfiSnUz4ZCag0XfCIXf0QBgeWd4I1gAEZB0H6OkWbw2nhCRfRC6fz4iyBxqfJeRgjOZCfWZBAwQGHkQCd5H3smOpaBjjxziC378g6AZCYqRukrLIr6zz8H3vfOMmFgvjdD77C4bigZBDohq9a1wnmbD4K4yEs3",
    email: "lucjuarez@msn.com"
  }
];

// 📊 FUNCIÓN META
async function getInsights(accountId, token) {
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
}

// 🚨 ALERTAS
function checkAlerts(data) {
  const { spend, results } = data;

  if (spend === 0 && results === 0) {
    return {
      type: "warning",
      message: "⚠️ No hay actividad en la cuenta (campañas pausadas o sin presupuesto)"
    };
  }

  if (spend > 0 && results === 0) {
    return {
      type: "critical",
      message: "🚨 Estás gastando dinero sin obtener resultados"
    };
  }

  if (spend > 0 && results > 0) {
    return {
      type: "ok",
      message: "✅ Tus campañas están funcionando correctamente"
    };
  }

  return {
    type: "info",
    message: "ℹ️ Sin datos suficientes"
  };
}

// 🧪 TEST BACKEND
app.get("/", (req, res) => {
  res.send("🚨 AdsAlert funcionando");
});

// 🔍 ENDPOINT MANUAL
app.get("/check", async (req, res) => {
  try {
    const acc = accounts[0];

    const data = await getInsights(acc.account_id, acc.token);
    const alert = checkAlerts(data);

    res.json({ data, alert });

  } catch (error) {
    res.json({
      error: error.response?.data || error.message
    });
  }
});

// 📩 TEST EMAIL
app.get("/test-email", async (req, res) => {
  try {
    await sendEmail({
      message: "🚨 Esto es una prueba de AdsAlert",
      email: "lucjuarez@msn.com"
    });

    res.send("Email enviado");
  } catch (error) {
    console.log(error);
    res.send("Error enviando email");
  }
});

// 🔥 CRON AUTOMÁTICO (cada minuto para test)
cron.schedule("* * * * *", async () => {
  console.log("⏰ Ejecutando monitoreo automático...");

  for (let acc of accounts) {
    try {
      const data = await getInsights(acc.account_id, acc.token);
      const alert = checkAlerts(data);

      console.log(`📊 ${acc.name}`, data);
      console.log(`🚨 ${acc.name}`, alert);

      const prev = lastStatus[acc.account_id];

      // 🔥 SOLO ACTÚA SI CAMBIA EL ESTADO
      if (alert.type !== prev) {
        lastStatus[acc.account_id] = alert.type;

        if (alert.type === "warning" || alert.type === "critical") {
          await sendEmail({
            message: `${acc.name}: ${alert.message}`,
            email: acc.email
          });

          console.log(`📩 Email enviado a ${acc.email}`);
        }
      }

    } catch (error) {
      console.log(`❌ Error en ${acc.name}:`, error.message);
    }
  }
});

// 🚀 SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});;
