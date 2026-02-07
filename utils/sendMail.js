const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const sendMail = async ({ to, subject, html }) => {
  const appName = process.env.APP_NAME || "User Management by CG";
  await transporter.sendMail({
    from: `"${appName}" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html
  });
};

module.exports = sendMail;
