'use strict';
require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT || '4000', 10),
  apiKey: process.env.API_KEY || '',

  smtp: {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || 'noreply@pantrypal.app',
  },

  logLevel: process.env.LOG_LEVEL || 'info',
};
