const nodemailer = require('nodemailer');

// ── Brevo HTTP API sender (preferred — works on all hosting, no SMTP ports) ──
async function sendViaBrevoApi(to, subject, html, text) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.APP_URL?.replace(/https?:\/\//, 'noreply@') || 'noreply@lncarchives.onrender.com';

  const payload = {
    sender: { name: 'LNC Research Archives', email: senderEmail },
    to: [{ email: to }],
    subject,
    htmlContent: html,
    textContent: text
  };

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Brevo API error: HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.messageId || 'sent';
}

// Email configuration from database (SMTP fallback)
const createTransporter = async () => {
  try {
    const EmailSettings = require('../models/EmailSettings');
    const settings = await EmailSettings.findById('email_settings');
    
    if (!settings || !settings.isConfigured) {
      console.warn('⚠️ Email not configured. Please configure email settings in Admin > Email Settings.');
      return null;
    }
    
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpSecure,
      auth: {
        user: settings.emailUser,
        pass: settings.getDecryptedPassword()
      },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
    
    return transporter;
  } catch (error) {
    console.error('❌ Error creating email transporter:', error);
    return null;
  }
};

/**
 * Send account details email to user
 */
async function sendAccountDetailsEmail(userEmail, userName, password, role) {
  try {
    const subject = 'Your LNC Research Archives Account Details';
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .credentials { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #667eea; }
            .credential-item { margin: 10px 0; }
            .label { font-weight: bold; color: #667eea; }
            .password { font-family: monospace; background: #f0f0f0; padding: 10px; border-radius: 5px; font-size: 16px; }
            .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            .btn { display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to LNC Research Archives!</h1>
            </div>
            <div class="content">
              <p>Hello ${userName},</p>
              <p>Your account request has been approved. Below are your account credentials:</p>
              
              <div class="credentials">
                <div class="credential-item">
                  <span class="label">Email:</span> ${userEmail}
                </div>
                <div class="credential-item">
                  <span class="label">Password:</span>
                  <div class="password">${password}</div>
                </div>
                <div class="credential-item">
                  <span class="label">Role:</span> ${role}
                </div>
              </div>
              
              <div class="warning">
                <strong>⚠️ Important:</strong> Please change your password after your first login for security purposes. You can change your password in the profile section.
              </div>
              
              <p>You can now log in to LNC Research Archives using the credentials above:</p>
              <a href="${process.env.APP_URL || 'https://nonstandardized-zion-exiguous.ngrok-free.dev'}/login" class="btn">Login to LNC Research Archives</a>
              
              <p>If you have any questions or need assistance, please contact the administrator.</p>
              
              <p>Best regards,<br>The LNC Research Archives Team</p>
            </div>
            <div class="footer">
              <p>This is an automated email. Please do not reply to this message.</p>
            </div>
          </div>
        </body>
        </html>
    `;
    const text = `Welcome to LNC Research Archives!\n\nHello ${userName},\n\nYour account has been approved.\nEmail: ${userEmail}\nPassword: ${password}\nRole: ${role}\n\nPlease change your password after first login.\n\nLogin at: ${process.env.APP_URL}/login`;

    if (process.env.BREVO_API_KEY) {
      const messageId = await sendViaBrevoApi(userEmail, subject, html, text);
      console.log('✅ Account details email sent via Brevo API:', messageId);
      return { success: true, messageId };
    }

    const transporter = await createTransporter();
    if (!transporter) return { success: false, error: 'Email service not configured' };
    const EmailSettings = require('../models/EmailSettings');
    const settings = await EmailSettings.findById('email_settings');
    const info = await transporter.sendMail({ from: settings?.emailUser, to: userEmail, subject, html, text });
    console.log('✅ Account details email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending account details email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send notification email to admin about new account request
 */
async function sendAdminNotificationEmail(adminEmail, requestName, requestEmail, requestRole) {
  try {
    const subject = 'New Account Request - LNC Research Archives';
    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif">
      <h2>New Account Request</h2>
      <p>Hello Administrator,</p>
      <p>A new account request has been submitted:</p>
      <ul>
        <li><strong>Name:</strong> ${requestName}</li>
        <li><strong>Email:</strong> ${requestEmail}</li>
        <li><strong>Requested Role:</strong> ${requestRole}</li>
      </ul>
      <p><a href="${process.env.APP_URL}/admin/account-requests">Review Account Requests</a></p>
    </body></html>`;
    const text = `New Account Request\n\nName: ${requestName}\nEmail: ${requestEmail}\nRole: ${requestRole}\n\nReview: ${process.env.APP_URL}/admin/account-requests`;

    if (process.env.BREVO_API_KEY) {
      const messageId = await sendViaBrevoApi(adminEmail, subject, html, text);
      console.log('✅ Admin notification email sent via Brevo API:', messageId);
      return { success: true, messageId };
    }

    const transporter = await createTransporter();
    if (!transporter) return { success: false, error: 'Email service not configured' };
    const EmailSettings = require('../models/EmailSettings');
    const settings = await EmailSettings.findById('email_settings');
    const info = await transporter.sendMail({ from: settings?.emailUser, to: adminEmail, subject, html, text });
    console.log('✅ Admin notification email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending admin notification email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send password reset email to user with a time-limited reset link
 */
async function sendPasswordResetEmail(userEmail, userName, resetUrl) {
  try {
    const subject = 'Password Reset - LNC Research Archives';
    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif">
      <h2>Password Reset Request</h2>
      <p>Hello ${userName},</p>
      <p>Your password reset request has been <strong>approved</strong>. Click the link below to reset your password:</p>
      <p><a href="${resetUrl}" style="background:#667eea;color:white;padding:12px 24px;text-decoration:none;border-radius:5px;display:inline-block">Reset My Password</a></p>
      <p style="color:#666;font-size:13px">Link expires in 1 hour. If the button doesn't work: ${resetUrl}</p>
    </body></html>`;
    const text = `Password Reset\n\nHello ${userName},\n\nReset your password: ${resetUrl}\n\nThis link expires in 1 hour.`;

    if (process.env.BREVO_API_KEY) {
      const messageId = await sendViaBrevoApi(userEmail, subject, html, text);
      console.log('✅ Password reset email sent via Brevo API:', messageId);
      return { success: true, messageId };
    }

    const transporter = await createTransporter();
    if (!transporter) return { success: false, error: 'Email service not configured' };
    const EmailSettings = require('../models/EmailSettings');
    const settings = await EmailSettings.findById('email_settings');
    const info = await transporter.sendMail({ from: settings?.emailUser, to: userEmail, subject, html, text });
    console.log('✅ Password reset email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending password reset email:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendAccountDetailsEmail,
  sendAdminNotificationEmail,
  sendPasswordResetEmail
};

