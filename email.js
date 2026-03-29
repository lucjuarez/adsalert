const nodemailer = require("nodemailer");

async function sendEmail({ message, email }) {
  try {
    const transporter = nodemailer.createTransport({
      host: "mail.lucianojuarez.com.ar",
      port: 465,
      secure: true,
      auth: {
        user: "alertads@lucianojuarez.com.ar",
        pass: "Thiago26029702"
      }
    });

    await transporter.sendMail({
      from: `"AdsAlert 🚨" <alertads@lucianojuarez.com.ar>`,
      to: email,
      subject: "🚨 Alerta de campañas Meta Ads",
      text: message,
    });

    console.log("📩 Email enviado correctamente");

  } catch (error) {
    console.log("❌ Error enviando email:", error.message);
  }
}

module.exports = { sendEmail };