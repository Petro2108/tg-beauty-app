require('dotenv').config();

module.exports = {
  DATABASE_URL: process.env.DATABASE_URL,
  PLATFORM_BOT_TOKEN: process.env.PLATFORM_BOT_TOKEN,
  PLATFORM_ADMIN_TG_ID: process.env.PLATFORM_ADMIN_TG_ID,
  PLATFORM_ADMIN_TOKEN: process.env.PLATFORM_ADMIN_TOKEN,
  APP_URL: process.env.APP_URL || 'http://localhost:8080',
  API_URL: process.env.API_URL || 'http://localhost:3000',
  PORT: parseInt(process.env.PORT || '3000', 10),
  BOT_TOKEN_ENCRYPTION_KEY: process.env.BOT_TOKEN_ENCRYPTION_KEY,
  PAYMENT_CARD: process.env.PAYMENT_CARD || 'XXXX XXXX XXXX XXXX',
};
