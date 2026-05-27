const { Bot } = require('grammy');
const { decrypt } = require('../crypto');
const { query } = require('../db');

const activeBots = new Map(); // master_id → Bot instance

async function getBotForMaster(masterId) {
  // pg может вернуть BIGSERIAL как строку; нормализуем к Number
  const id = Number(masterId);
  return activeBots.get(id) || null;
}

async function registerMasterBot(master) {
  const botToken = decrypt(master.bot_token);
  const bot = new Bot(botToken);
  const { setupMasterBotHandlers } = require('./masterBot');
  setupMasterBotHandlers(bot, master);
  activeBots.set(Number(master.id), bot);
  return bot;
}

async function loadAllActiveBots() {
  const { rows } = await query('SELECT * FROM masters WHERE is_active = true');
  let loaded = 0;
  for (const master of rows) {
    try {
      await registerMasterBot(master);
      loaded++;
    } catch (e) {
      console.error(`Failed to load bot for master ${master.slug}:`, e.message);
    }
  }
  console.log(`Loaded ${loaded}/${rows.length} master bots`);
}

async function unregisterMasterBot(masterId) {
  activeBots.delete(Number(masterId));
}

module.exports = { getBotForMaster, registerMasterBot, loadAllActiveBots, unregisterMasterBot };
