const TelegramBot = require('node-telegram-bot-api');

const token = '8600225549:AAF5LHT9bLcQV2zNeNWJjPDzDaP-JFT59Eg';

const bot = new TelegramBot(token, { polling: true });

bot.onText(//start/, (msg) => {
bot.sendMessage(
msg.chat.id,
"👋 Bienvenue sur Gonaf+\n\nRecharge rapide et sécurisée.",
{
reply_markup: {
keyboard: [
['💳 Recharge Wise'],
['💙 Recharge PayPal'],
['💸 Recharge Cash App'],
['🟣 Recharge Pana'],
['📈 Taux du jour'],
['📞 Support']
],
resize_keyboard: true
}
}
);
});

bot.on('message', (msg) => {
const text = msg.text;

if (text === '💳 Recharge Wise') {
    bot.sendMessage(
        msg.chat.id,
        `💳 Recharge Wise\n\nEnvoyez le montant que vous souhaitez recharger.`
    );
}

if (text === '💙 Recharge PayPal') {
    bot.sendMessage(
        msg.chat.id,
        `💙 Recharge PayPal\n\nEnvoyez le montant que vous souhaitez recharger.`
    );
}

if (text === '💸 Recharge Cash App') {
    bot.sendMessage(
        msg.chat.id,
        `💸 Recharge Cash App\n\nEnvoyez le montant que vous souhaitez recharger.`
    );
}

if (text === '🟣 Recharge Pana') {
    bot.sendMessage(
        msg.chat.id,
        `🟣 Recharge Pana\n\nEnvoyez le montant que vous souhaitez recharger.`
    );
}

if (text === '📈 Taux du jour') {
    bot.sendMessage(
        msg.chat.id,
        `📈 Taux actuel : 128.77 HTG/USD`
    );
}

if (text === '📞 Support') {
    bot.sendMessage(
        msg.chat.id,
        `📞 Support:\n@xpanda_034official`
    );
}

});

console.log('Bot en ligne 🚀');
