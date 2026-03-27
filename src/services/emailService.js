'use strict';

const nodemailer = require('nodemailer');
const config = require('../config');
const logger = require('../config/logger');

// ─── Transporter ──────────────────────────────────────────────────────────────

function createTransporter() {
  // In test/dev without real SMTP, use Nodemailer's built-in test account fallback
  if (!config.smtp.host || config.smtp.host === 'localhost') {
    return nodemailer.createTransport({
      host: 'localhost',
      port: 1025,
      ignoreTLS: true,
    });
  }

  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
}

const transporter = createTransporter();

// ─── Send helper ──────────────────────────────────────────────────────────────

async function sendEmail({ to, subject, html, text }) {
  const info = await transporter.sendMail({
    from: config.smtp.from,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]+>/g, ''),
  });
  logger.info('Email sent', { messageId: info.messageId, to, subject });
  return info;
}

// ─── Email templates ──────────────────────────────────────────────────────────

/**
 * pantry.item.added
 *
 * Payload contract (must match Django email_service.py v1.0.0):
 *   user_id, username, email, pantry_id,
 *   product_name, product_upc, quantity, quantity_type, expiration_date
 */
async function sendItemAddedEmail(payload) {
  const { email, username, product_name, quantity, quantity_type, expiration_date } = payload;

  const expiryLine = expiration_date
    ? `<p><strong>Estimated expiry:</strong> ${expiration_date}</p>`
    : '';

  const html = `
    <h2>Item added to your PantryPal pantry 🛒</h2>
    <p>Hi ${username},</p>
    <p>You've added the following item to your pantry:</p>
    <table cellpadding="6" style="border-collapse:collapse;">
      <tr><td><strong>Product</strong></td><td>${product_name}</td></tr>
      <tr><td><strong>Quantity</strong></td><td>${quantity} ${quantity_type}</td></tr>
    </table>
    ${expiryLine}
    <p>Happy cooking! 🍳</p>
    <p style="color:#999;font-size:12px;">PantryPal · You're receiving this because you added an item to your pantry.</p>
  `;

  return sendEmail({ to: email, subject: `✅ ${product_name} added to your pantry`, html });
}

/**
 * pantry.item.removed
 *
 * Payload contract (must match Django email_service.py v1.0.0):
 *   user_id, username, email, pantry_id, product_name
 */
async function sendItemRemovedEmail(payload) {
  const { email, username, product_name } = payload;

  const html = `
    <h2>Item removed from your PantryPal pantry 🗑️</h2>
    <p>Hi ${username},</p>
    <p><strong>${product_name}</strong> has been removed from your pantry.</p>
    <p>If this was a mistake, you can re-add it from the PantryPal app.</p>
    <p style="color:#999;font-size:12px;">PantryPal · Pantry update notification.</p>
  `;

  return sendEmail({ to: email, subject: `🗑️ ${product_name} removed from your pantry`, html });
}

/**
 * pantry.item.expiring_soon
 *
 * Payload contract (must match Django email_service.py v1.0.0):
 *   user_id, email, items: [{ product_name, expiration_date, days_remaining }]
 */
async function sendExpiringSoonEmail(payload) {
  const { email, items } = payload;

  const rows = items
    .map(
      (item) =>
        `<tr>
          <td>${item.product_name}</td>
          <td>${item.expiration_date}</td>
          <td style="color:${item.days_remaining <= 2 ? '#dc3545' : '#fd7e14'}">
            ${item.days_remaining} day${item.days_remaining !== 1 ? 's' : ''}
          </td>
        </tr>`,
    )
    .join('');

  const html = `
    <h2>⏰ Items expiring soon in your PantryPal pantry</h2>
    <p>The following items need your attention:</p>
    <table cellpadding="6" border="1" style="border-collapse:collapse;width:100%;">
      <thead>
        <tr>
          <th>Product</th><th>Expiry Date</th><th>Days Left</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p>Head to the <a href="https://pantrypal.app/recipes">Recipes page</a> to use these up! 🍲</p>
    <p style="color:#999;font-size:12px;">PantryPal · Expiry reminder notification.</p>
  `;

  return sendEmail({
    to: email,
    subject: `⏰ ${items.length} item${items.length !== 1 ? 's' : ''} expiring soon in your pantry`,
    html,
  });
}

module.exports = { sendItemAddedEmail, sendItemRemovedEmail, sendExpiringSoonEmail };
