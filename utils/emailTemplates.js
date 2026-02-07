const APP_NAME = process.env.APP_NAME || "User Management by CG";
const APP_LOGO_URL = process.env.APP_LOGO_URL || "";

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const logoMarkup = () => {
  if (APP_LOGO_URL) {
    return `<img src="${escapeHtml(APP_LOGO_URL)}" alt="${escapeHtml(APP_NAME)} logo" width="36" height="36" style="display:block;border-radius:6px;" />`;
  }

  // Email-safe fallback logo that does not depend on external image loading
  return `
    <div style="width:36px;height:36px;border-radius:8px;background:#1d4ed8;color:#ffffff;font-family:Arial,sans-serif;font-weight:700;font-size:14px;line-height:36px;text-align:center;">
      CG
    </div>
  `;
};

const brandTemplate = ({ title, intro, contentHtml, footerNote }) => `
  <div style="background:#f3f6fb;padding:24px 12px;font-family:Arial,sans-serif;color:#1f2937;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <div style="padding:18px 20px;border-bottom:1px solid #e5e7eb;background:#f8fafc;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td style="width:44px;vertical-align:middle;">
              ${logoMarkup()}
            </td>
            <td style="vertical-align:middle;">
              <div style="font-size:18px;font-weight:700;color:#0f172a;">${escapeHtml(APP_NAME)}</div>
            </td>
          </tr>
        </table>
      </div>
      <div style="padding:22px 20px;">
        <h2 style="margin:0 0 10px;font-size:20px;color:#0f172a;">${escapeHtml(title)}</h2>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#374151;">${intro}</p>
        ${contentHtml}
      </div>
      <div style="padding:14px 20px;background:#f8fafc;border-top:1px solid #e5e7eb;">
        <p style="margin:0;font-size:12px;color:#64748b;line-height:1.5;">
          ${footerNote || `This is an automated email from ${escapeHtml(APP_NAME)}.`}
        </p>
      </div>
    </div>
  </div>
`;

const otpBlock = (otp) => `
  <div style="margin:16px 0 18px;text-align:center;">
    <div style="display:inline-block;padding:12px 16px;border:1px dashed #94a3b8;border-radius:8px;background:#f8fafc;">
      <div style="font-size:12px;color:#64748b;margin-bottom:6px;">One-Time Password</div>
      <div style="font-size:28px;letter-spacing:8px;font-weight:700;color:#0f172a;">${escapeHtml(otp)}</div>
    </div>
  </div>
`;

const toStatusLabel = (status = "") =>
  status
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "N/A";

const formatDate = (date) => {
  if (!date) return "N/A";
  return new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

const verificationOtpEmail = (otp) =>
  brandTemplate({
    title: "Verify Your Email",
    intro:
      "Use the OTP below to complete your registration. The OTP is valid for 30 minutes.",
    contentHtml: `${otpBlock(otp)}`,
    footerNote:
      "If you did not request this, you can safely ignore this email."
  });

const resetPasswordOtpEmail = (otp) =>
  brandTemplate({
    title: "Reset Password Request",
    intro:
      "We received a request to reset your password. Use the OTP below to continue. The OTP is valid for 30 minutes.",
    contentHtml: `${otpBlock(otp)}`,
    footerNote:
      "If you did not request this password reset, please ignore this email."
  });

const followUpReminderEmail = (user) =>
  brandTemplate({
    title: "Follow-up Reminder",
    intro: "You have a scheduled callback in the next 5 minutes.",
    contentHtml: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;color:#374151;border-collapse:collapse;">
        <tr><td style="padding:6px 0;font-weight:600;width:140px;">Company</td><td style="padding:6px 0;">${escapeHtml(user.companyName || "N/A")}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600;">Contact</td><td style="padding:6px 0;">${escapeHtml(user.contactNumber || "N/A")}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600;">Address</td><td style="padding:6px 0;">${escapeHtml(user.address || "N/A")}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600;">Status</td><td style="padding:6px 0;">${escapeHtml(toStatusLabel(user.status))}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600;">Follow Up Time</td><td style="padding:6px 0;">${escapeHtml(formatDate(user.followUpDateTime))}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600;">Notes</td><td style="padding:6px 0;">${escapeHtml(user.notes || "N/A")}</td></tr>
      </table>
    `
  });

module.exports = {
  verificationOtpEmail,
  resetPasswordOtpEmail,
  followUpReminderEmail
};
