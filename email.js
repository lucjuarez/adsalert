const nodemailer = require("nodemailer");

async function sendEmail(alert) {
  const transporter = nodemailer.createTransport({
    host: "mail.lucianojuarez.com.ar",
    port: 465,
    secure: true,
    auth: {
      user: "alertads@lucianojuarez.com.ar",
      pass: "Thiago26029702"
    }
  });

  const mailOptions = {
    from: '"AdsAlert 🚨" <alertads@lucianojuarez.com.ar>',
    to: "lucjuarez@msn.com",
    subject: "🚨 Alerta de AdsAlert",
    text: alert.message
  };

  await transporter.sendMail(mailOptions);
}

module.exports = { sendEmail };