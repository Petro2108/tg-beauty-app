const { query } = require('../db');
const { APP_URL } = require('../config');

function setupMasterBotHandlers(bot, masterData) {
  bot.command('start', async ctx => {
    const { rows } = await query(
      'SELECT display_name, specializations FROM master_profiles WHERE master_id = $1',
      [masterData.id]
    );
    const name = rows[0]?.display_name || 'Мастер';
    const spec = rows[0]?.specializations || '';

    await ctx.reply(
      `👋 Привет, ${ctx.from.first_name}!\n\n` +
      `Это приложение ${name}\n` +
      (spec ? `(${spec})\n\n` : '\n') +
      `Нажми кнопку ниже, чтобы посмотреть услуги и записаться 👇`,
      {
        reply_markup: {
          inline_keyboard: [[
            {
              text: '💅 Открыть приложение',
              web_app: { url: `${APP_URL}?m=${masterData.slug}` },
            },
          ]],
        },
      }
    );
  });

  bot.on('message', async ctx => {
    if (ctx.message.web_app_data) return; // данные из Mini App — обрабатываются через API
    await ctx.reply(
      `Нажми кнопку «Записаться», чтобы выбрать услугу и время 👇`,
      {
        reply_markup: {
          inline_keyboard: [[
            {
              text: '💅 Записаться',
              web_app: { url: `${APP_URL}?m=${masterData.slug}` },
            },
          ]],
        },
      }
    );
  });
}

module.exports = { setupMasterBotHandlers };
