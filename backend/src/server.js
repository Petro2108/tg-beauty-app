require('dotenv').config();
const Fastify = require('fastify');
const { Bot } = require('grammy');
const { setupPlatformBotHandlers } = require('./bots/platformBot');
const { loadAllActiveBots } = require('./bots/manager');
const { PLATFORM_BOT_TOKEN, API_URL, PORT } = require('./config');

const app = Fastify({ logger: true });

app.register(require('@fastify/cors'), { origin: true });

// Platform bot
const platformBot = new Bot(PLATFORM_BOT_TOKEN);
setupPlatformBotHandlers(platformBot);
platformBot.api.setWebhook(`${API_URL}/webhook/platform`).catch(e =>
  app.log.warn('Platform bot webhook not set (probably dev mode):', e.message)
);
app.decorate('platformBot', platformBot);

// Routes
app.register(require('./routes/public'));
app.register(require('./routes/client'));
app.register(require('./routes/admin'));
app.register(require('./routes/platform'));
app.register(require('./routes/webhooks'));
app.register(require('./routes/files'));

// Cron jobs
require('./jobs/reminders');

app.listen({ port: PORT, host: '0.0.0.0' }, async (err) => {
  if (err) { app.log.error(err); process.exit(1); }
  await loadAllActiveBots();
});

module.exports = app;
