const nodemailer = require("nodemailer");
const { EMAIL_CONFIG, EMAIL_TEMPLATES } = require("../../../shared/config/email");

// Create transporter
const transporter = nodemailer.createTransport(EMAIL_CONFIG);

/**
 * Verify email configuration
 */
const verifyEmailConfig = async () => {
  try {
    await transporter.verify();
    console.log("✅ Email service is ready");
    return true;
  } catch (error) {
    console.error("❌ Email service error:", error.message);
    return false;
  }
};

/**
 * Send forgot password email
 * @param {string} to - Recipient email
 * @param {string} fullname - User's full name
 * @param {string} newPassword - New generated password
 */
const sendForgotPasswordEmail = async (to, fullname, newPassword) => {
  try {
    const mailOptions = {
      from: `"HNALMS System" <${EMAIL_CONFIG.auth.user}>`,
      to: to,
      subject: EMAIL_TEMPLATES.FORGOT_PASSWORD.subject,
      html: EMAIL_TEMPLATES.FORGOT_PASSWORD.getHtml(fullname, newPassword)
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent:", info.messageId);
    return {
      success: true,
      messageId: info.messageId
    };
  } catch (error) {
    console.error("❌ Send email error:", error);
    throw new Error("Failed to send email");
  }
};

/**
 * Send general notification email
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - Email HTML content
 */
const sendEmail = async (to, subject, html) => {
  try {
    const mailOptions = {
      from: `"HNALMS System" <${EMAIL_CONFIG.auth.user}>`,
      to: to,
      subject: subject,
      html: html
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent:", info.messageId);
    return {
      success: true,
      messageId: info.messageId
    };
  } catch (error) {
    console.error("❌ Send email error:", error);
    throw new Error("Failed to send email");
  }
};

module.exports = {
  verifyEmailConfig,
  sendForgotPasswordEmail,
  sendEmail
};
