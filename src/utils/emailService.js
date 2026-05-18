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
              <a href="${process.env.APP_URL}/login" class="btn">Login to LNC Research Archives</a>
              
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

/**
 * Notify thesis author + admins about a new file request
 */
async function sendFileRequestNotification(recipients, requester, thesis, reason, approvalUrl) {
  try {
    const subject = `Thesis File Request: "${thesis.title}"`;
    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:24px;border-radius:8px 8px 0 0">
        <h2 style="margin:0">📬 New Thesis File Request</h2>
      </div>
      <div style="background:#f9f9f9;padding:24px;border-radius:0 0 8px 8px">
        <p>A user has requested access to a thesis file in the LNC Research Archives.</p>
        <table style="width:100%;border-collapse:collapse;background:white;border-radius:6px;overflow:hidden;margin:16px 0">
          <tr style="border-bottom:1px solid #eee"><td style="padding:10px 14px;color:#667eea;font-weight:bold;width:140px">Requester</td><td style="padding:10px 14px">${requester.name} (${requester.email})</td></tr>
          <tr style="border-bottom:1px solid #eee"><td style="padding:10px 14px;color:#667eea;font-weight:bold">Thesis</td><td style="padding:10px 14px">${thesis.title}</td></tr>
          <tr style="border-bottom:1px solid #eee"><td style="padding:10px 14px;color:#667eea;font-weight:bold">Authors</td><td style="padding:10px 14px">${thesis.authorsName || 'N/A'}</td></tr>
          <tr style="border-bottom:1px solid #eee"><td style="padding:10px 14px;color:#667eea;font-weight:bold">Year</td><td style="padding:10px 14px">${thesis.yearPublished || 'N/A'}</td></tr>
          <tr><td style="padding:10px 14px;color:#667eea;font-weight:bold;vertical-align:top">Reason</td><td style="padding:10px 14px">${reason}</td></tr>
        </table>
        <p>To <strong>approve</strong> this request and send the file to the requester, click the button below:</p>
        <p style="text-align:center">
          <a href="${approvalUrl}" style="background:#667eea;color:white;padding:14px 28px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold">✅ Approve & Send File</a>
        </p>
        <p style="color:#999;font-size:12px;text-align:center">This approval link expires in 7 days. Only one approval is needed.</p>
      </div>
    </body></html>`;
    const text = `New Thesis File Request\n\nRequester: ${requester.name} (${requester.email})\nThesis: ${thesis.title}\nReason: ${reason}\n\nApprove: ${approvalUrl}`;

    const results = [];
    for (const to of recipients) {
      try {
        if (process.env.BREVO_API_KEY) {
          const messageId = await sendViaBrevoApi(to, subject, html, text);
          results.push({ to, success: true, messageId });
        } else {
          const transporter = await createTransporter();
          if (!transporter) { results.push({ to, success: false, error: 'Not configured' }); continue; }
          const EmailSettings = require('../models/EmailSettings');
          const settings = await EmailSettings.findById('email_settings');
          const info = await transporter.sendMail({ from: settings?.emailUser, to, subject, html, text });
          results.push({ to, success: true, messageId: info.messageId });
        }
      } catch (e) {
        results.push({ to, success: false, error: e.message });
      }
    }
    console.log(`✅ File request notifications sent to ${results.filter(r => r.success).length}/${recipients.length} recipients`);
    return { success: true, results };
  } catch (error) {
    console.error('❌ Error sending file request notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send the approved file link to the requester
 */
async function sendFileFulfillmentEmail(to, requesterName, thesis, signedFileUrl, expiresHours = 48) {
  try {
    const subject = `Your Thesis File Request Has Been Approved: "${thesis.title}"`;
    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#28a745,#20c997);color:white;padding:24px;border-radius:8px 8px 0 0">
        <h2 style="margin:0">✅ Your File Request Was Approved</h2>
      </div>
      <div style="background:#f9f9f9;padding:24px;border-radius:0 0 8px 8px">
        <p>Hello ${requesterName},</p>
        <p>Your request for the following thesis has been approved. You can download the file using the link below:</p>
        <div style="background:white;padding:16px;border-radius:6px;border-left:4px solid #28a745;margin:16px 0">
          <strong>${thesis.title}</strong><br>
          <span style="color:#666">Authors: ${thesis.authorsName || 'N/A'} &bull; Year: ${thesis.yearPublished || 'N/A'}</span>
        </div>
        <p style="text-align:center">
          <a href="${signedFileUrl}" style="background:#28a745;color:white;padding:14px 28px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold">📥 Download Thesis PDF</a>
        </p>
        <div style="background:#fff3cd;border-left:4px solid #ffc107;padding:12px 16px;border-radius:4px;margin-top:16px">
          <strong>⚠️ Important:</strong> This download link expires in <strong>${expiresHours} hours</strong>. Please download the file promptly.
        </div>
        <p style="color:#999;font-size:12px;margin-top:16px">If the button doesn't work, copy this URL: ${signedFileUrl}</p>
      </div>
    </body></html>`;
    const text = `Your Thesis File Request Was Approved\n\nHello ${requesterName},\n\nYour request for "${thesis.title}" has been approved.\n\nDownload: ${signedFileUrl}\n\nThis link expires in ${expiresHours} hours.`;

    if (process.env.BREVO_API_KEY) {
      const messageId = await sendViaBrevoApi(to, subject, html, text);
      console.log('✅ Fulfillment email sent via Brevo API:', messageId);
      return { success: true, messageId };
    }
    const transporter = await createTransporter();
    if (!transporter) return { success: false, error: 'Email service not configured' };
    const EmailSettings = require('../models/EmailSettings');
    const settings = await EmailSettings.findById('email_settings');
    const info = await transporter.sendMail({ from: settings?.emailUser, to, subject, html, text });
    console.log('✅ Fulfillment email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending fulfillment email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Notify the OTHER party once a file request has been approved
 * e.g. if Admin approved → notify Author, and vice versa
 */
async function sendApprovalSyncEmail(to, recipientName, approverType, requester, thesis) {
  try {
    const subject = `File Request Approved by ${approverType}: "${thesis.title}"`;
    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:24px;border-radius:8px 8px 0 0">
        <h2 style="margin:0">🔔 File Request Approved</h2>
      </div>
      <div style="background:#f9f9f9;padding:24px;border-radius:0 0 8px 8px">
        <p>Hello ${recipientName},</p>
        <p>This is to inform you that the following thesis file request has been <strong>approved and fulfilled</strong> by the <strong>${approverType}</strong>.</p>
        <table style="width:100%;border-collapse:collapse;background:white;border-radius:6px;overflow:hidden;margin:16px 0">
          <tr style="border-bottom:1px solid #eee"><td style="padding:10px 14px;color:#667eea;font-weight:bold;width:140px">Thesis</td><td style="padding:10px 14px">${thesis.title}</td></tr>
          <tr style="border-bottom:1px solid #eee"><td style="padding:10px 14px;color:#667eea;font-weight:bold">Requester</td><td style="padding:10px 14px">${requester.name} (${requester.email})</td></tr>
          <tr style="border-bottom:1px solid #eee"><td style="padding:10px 14px;color:#667eea;font-weight:bold">Approved By</td><td style="padding:10px 14px">${approverType}</td></tr>
        </table>
        <p>The thesis file has already been sent to the requester's email. No further action is required from you.</p>
        <p style="color:#999;font-size:12px">This is an automated synchronization notice from LNC Research Archives.</p>
      </div>
    </body></html>`;
    const text = `File Request Approved\n\nHello ${recipientName},\n\nThe file request for "${thesis.title}" was approved by the ${approverType}.\nRequester: ${requester.name} (${requester.email})\n\nThe file has been sent to the requester. No action needed.`;

    if (process.env.BREVO_API_KEY) {
      const messageId = await sendViaBrevoApi(to, subject, html, text);
      console.log('✅ Sync notification sent via Brevo API:', messageId);
      return { success: true, messageId };
    }
    const transporter = await createTransporter();
    if (!transporter) return { success: false, error: 'Email service not configured' };
    const EmailSettings = require('../models/EmailSettings');
    const settings = await EmailSettings.findById('email_settings');
    const info = await transporter.sendMail({ from: settings?.emailUser, to, subject, html, text });
    console.log('✅ Sync notification sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending sync notification:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendAccountDetailsEmail,
  sendAdminNotificationEmail,
  sendPasswordResetEmail,
  sendFileRequestNotification,
  sendFileFulfillmentEmail,
  sendApprovalSyncEmail
};

