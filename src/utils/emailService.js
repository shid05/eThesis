const nodemailer = require('nodemailer');

// Email configuration from database
const createTransporter = async () => {
  try {
    // Get email settings from database
    const EmailSettings = require('../models/EmailSettings');
    const settings = await EmailSettings.findById('email_settings');
    
    if (!settings || !settings.isConfigured) {
      console.warn('⚠️ Email not configured. Please configure email settings in Admin > Email Settings.');
      return null;
    }
    
    // Create transporter with database settings
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpSecure,
      auth: {
        user: settings.emailUser,
        pass: settings.getDecryptedPassword()
      },
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
    const transporter = await createTransporter();
    
    if (!transporter) {
      console.warn('⚠️ Email not configured. Account details email not sent.');
      return { success: false, error: 'Email service not configured' };
    }
    
    // Get email settings for "from" address
    const EmailSettings = require('../models/EmailSettings');
    const settings = await EmailSettings.findById('email_settings');
    
    const mailOptions = {
      from: settings?.emailFrom || settings?.emailUser || 'noreply@ethesis.com',
      to: userEmail,
      subject: 'Your LNC Research Archives Account Details',
      html: `
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
      `,
      text: `
        Welcome to LNC Research Archives!
        
        Hello ${userName},
        
        Your account request has been approved. Below are your account credentials:
        
        Email: ${userEmail}
        Password: ${password}
        Role: ${role}
        
        IMPORTANT: Please change your password after your first login for security purposes. You can change your password in the profile section.
        
        You can now log in to LNC Research Archives at: ${process.env.APP_URL || 'https://nonstandardized-zion-exiguous.ngrok-free.dev'}/login
        
        If you have any questions or need assistance, please contact the administrator.
        
        Best regards,
        The LNC Research Archives Team
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
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
    const transporter = await createTransporter();
    
    if (!transporter) {
      console.warn('⚠️ Email not configured. Admin notification email not sent.');
      return { success: false, error: 'Email service not configured' };
    }
    
    // Get email settings for "from" address
    const EmailSettings = require('../models/EmailSettings');
    const settings = await EmailSettings.findById('email_settings');
    
    const mailOptions = {
      from: settings?.emailFrom || settings?.emailUser || 'noreply@ethesis.com',
      to: adminEmail,
      subject: 'New Account Request - LNC Research Archives',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .request-info { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107; }
            .btn { display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>New Account Request</h1>
            </div>
            <div class="content">
              <p>Hello Administrator,</p>
              <p>A new account request has been submitted:</p>
              
              <div class="request-info">
                <p><strong>Name:</strong> ${requestName}</p>
                <p><strong>Email:</strong> ${requestEmail}</p>
                <p><strong>Requested Role:</strong> ${requestRole}</p>
              </div>
              
              <p>Please review and process this request in the admin dashboard:</p>
              <a href="${process.env.APP_URL || 'https://nonstandardized-zion-exiguous.ngrok-free.dev'}/admin/account-requests" class="btn">Review Account Requests</a>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        New Account Request - LNC Research Archives
        
        Hello Administrator,
        
        A new account request has been submitted:
        
        Name: ${requestName}
        Email: ${requestEmail}
        Requested Role: ${requestRole}
        
        Please review and process this request in the admin dashboard:
        ${process.env.APP_URL || 'https://nonstandardized-zion-exiguous.ngrok-free.dev'}/admin/account-requests
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
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
    const transporter = await createTransporter();
    
    if (!transporter) {
      console.warn('⚠️ Email not configured. Password reset email not sent.');
      return { success: false, error: 'Email service not configured' };
    }
    
    // Get email settings for "from" address
    const EmailSettings = require('../models/EmailSettings');
    const settings = await EmailSettings.findById('email_settings');
    
    const mailOptions = {
      from: settings?.emailFrom || settings?.emailUser || 'noreply@ethesis.com',
      to: userEmail,
      subject: 'Password Reset - LNC Research Archives',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .reset-info { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #667eea; }
            .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            .btn { display: inline-block; padding: 14px 28px; background: #667eea; color: white; text-decoration: none; border-radius: 8px; margin-top: 20px; font-weight: bold; font-size: 16px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔑 Password Reset Request</h1>
            </div>
            <div class="content">
              <p>Hello ${userName},</p>
              <p>Your password reset request has been <strong>approved</strong> by an administrator. Click the button below to reset your password:</p>
              
              <div class="reset-info" style="text-align: center;">
                <p style="margin-bottom: 16px;">Click the button below to set your new password:</p>
                <a href="${resetUrl}" class="btn" style="color: white;">Reset My Password</a>
              </div>
              
              <div class="warning">
                <strong>⚠️ Important:</strong>
                <ul style="margin: 8px 0 0 0; padding-left: 20px;">
                  <li>This link expires in <strong>1 hour</strong></li>
                  <li>If you didn't request this reset, please ignore this email</li>
                  <li>Never share this link with anyone</li>
                </ul>
              </div>
              
              <p style="color: #666; font-size: 13px; margin-top: 20px;">If the button above doesn't work, copy and paste the following URL into your browser:</p>
              <p style="color: #667eea; word-break: break-all; font-size: 13px;">${resetUrl}</p>
              
              <p>Best regards,<br>The LNC Research Archives Team</p>
            </div>
            <div class="footer">
              <p>This is an automated email. Please do not reply to this message.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Password Reset Request - LNC Research Archives
        
        Hello ${userName},
        
        Your password reset request has been approved by an administrator.
        
        Please click the link below to reset your password:
        ${resetUrl}
        
        IMPORTANT:
        - This link expires in 1 hour
        - If you didn't request this reset, please ignore this email
        - Never share this link with anyone
        
        Best regards,
        The LNC Research Archives Team
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
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

