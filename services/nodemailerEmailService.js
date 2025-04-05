const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
dotenv.config();

// Create a transporter
const transporter = nodemailer.createTransport({
  service: 'gmail', // You can use other services like SendGrid, Mailgun, etc.
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD // Use app-specific password for Gmail
  } 
});

/**
 * Send verification email with code
 * @param {string} email - Recipient email
 * @param {string} name - Recipient name
 * @param {string} code - Verification code
 * @returns {Promise<object>} - Nodemailer response
 */
const sendVerificationEmail = async (email, name, code) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || '"Your App" <your-app@example.com>',
      to: email,
      subject: 'Verify Your Email Address',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e4e4e4; border-radius: 5px;">
          <h2 style="color: #333; text-align: center;">Email Verification</h2>
          <p>Hello ${name},</p>
          <p>Thank you for registering with our application. Please verify your email address by entering the following verification code:</p>
          <div style="background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
            ${code}
          </div>
          <p>This code is valid for 30 minutes.</p>
          <p>If you did not register for an account, please ignore this email.</p>
          <p>Thank you,<br/>The Team</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw error;
  }
};

/**
 * Send password reset email with code
 * @param {string} email - Recipient email
 * @param {string} name - Recipient name
 * @param {string} code - Reset code
 * @returns {Promise<object>} - Nodemailer response
 */
const sendPasswordResetEmail = async (email, name, code) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || '"Your App" <your-app@example.com>',
      to: email,
      subject: 'Reset Your Password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e4e4e4; border-radius: 5px;">
          <h2 style="color: #333; text-align: center;">Password Reset</h2>
          <p>Hello ${name},</p>
          <p>We received a request to reset your password. Please enter the following code to proceed with resetting your password:</p>
          <div style="background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
            ${code}
          </div>
          <p>This code is valid for 30 minutes.</p>
          <p>If you did not request a password reset, please ignore this email.</p>
          <p>Thank you,<br/>The Team</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail
};