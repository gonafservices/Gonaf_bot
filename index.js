process.env.NTBA_FIX_319 = 1;

const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();

const bot = new TelegramBot(process.env.BOT_TOKEN, {
polling: { autoStart: true }
});

const ADMIN_ID = process.env.ADMIN_ID;

// ================= DB =================
const db = new sqlite3.Database('/tmp/gonaf.db');

db.run(`
CREATE TABLE IF NOT EXISTS transactions (
id INTEGER PRIMARY KEY AUTOINCREMENT,
order_id TEXT,
user_id TEXT,
service TEXT,
amount REAL,
method TEXT,
status TEXT,
date TEXT
)
`);

// ================= VARIABLES =================
const taux = parseFloat(process.env.TAUX) - 2;
const frais = parseFloat(process.env.FRAIS);

// ================= PAYMENT INFO =================
const paymentInfo = {
Moncash: process.env.MONCASH_INFO,
"PayPal 1": process.env.PAYPAL1_INFO,
"PayPal 2": process.env.PAYPAL2_INFO,
"Pana": process.env.PANA_INFO,
"Cash App": process.env.CASHAPP_INFO,
Wise: process.env.WISE_INFO
};

// ================= STATE =================
let state = {};
let counter = 0;

// ================= HELPERS =================
function now(){
return new Date().toLocaleString("fr-FR", {
timeZone: "America/Port-au-Prince"
});
}

function genId(){
counter++;
return `GNF-${counter}`;
}

function header(){
return `
━━━━━━━━━━━━━━━
📊 Taux: ${taux.toFixed(2)} HTG/USD
💸 Frais: ${(frais*100)}%
📞 WhatsApp: +1 849 775 7751
━━━━━━━━━━━━━━━
`;
}

function getMethods(service){
return ["Moncash","PayPal 1","PayPal 2","Cash App","Pana","Wise"]
.filter(m => m !== service);
}

function receipt(row){
return `
━━━━━━━━━━━━━━━
🧾 REÇU GONAF+

📦 Order: ${row.order_id}
👤 Client: ${row.user_id}
💼 Service: ${row.service}

💵 USD: ${row.amount}$
💳 Méthode: ${row.method}

📅 Date: ${row.date}

━━━━━━━━━━━━━━━
📞 WhatsApp: +1 849 775 7751
`;
}

// ================= START =================
bot.onText(/\/start/, (msg) => {
const chatId = msg.chat.id;

state[chatId] = {};

bot.sendMessage(chatId,
`━━━━━━━━━━━━━━━
👋 BIENVENUE SUR GONAF+

💳 Recharge rapide & sécurisée
━━━━━━━━━━━━━━━

Choisissez votre service :`,
{
reply_markup: {
keyboard: [
["Recharge Wise"],
["Recharge PayPal"],
["Recharge Cash App"],
["Recharge Pana"],
["Recharge Moncash"]
],
resize_keyboard: true
}
});
});

// ================= FLOW =================
bot.on('message', (msg) => {
const chatId = msg.chat.id;
const text = msg.text;

if (!text || text.startsWith('/')) return;

if (!state[chatId]) state[chatId] = {};

// ========= SERVICE =========
const map = {
"Recharge Wise": "Wise",
"Recharge PayPal": "PayPal",
"Recharge Cash App": "Cash App",
"Recharge Pana": "Pana",
"Recharge Moncash": "Moncash"
};

if (map[text]) {
state[chatId].service = map[text];
state[chatId].step = "amount";

return bot.sendMessage(chatId,
"💰 Entrez le montant en USD :");
}

// ========= AMOUNT =========
if (state[chatId].step === "amount") {

const usd = parseFloat(text);

if (isNaN(usd)) {
return bot.sendMessage(chatId, "❌ Montant invalide");
}

state[chatId].amount = usd;
state[chatId].step = "method";

return bot.sendMessage(chatId,
header() +
"\n💳 Choisissez méthode de paiement :",
{
reply_markup: {
keyboard: getMethods(state[chatId].service).map(m => [m]),
resize_keyboard: true,
one_time_keyboard: true
}
});
}

// ========= METHOD =========
if (state[chatId].step === "method") {

const methods = ["Moncash","PayPal 1","PayPal 2","Cash App","Pana","Wise"];

if (!methods.includes(text)) {
return bot.sendMessage(chatId, "❌ Méthode invalide");
}

const orderId = genId();

state[chatId].orderId = orderId;
state[chatId].method = text;
state[chatId].step = "proof";

const htg = state[chatId].amount * taux;
const total = htg * (1 + frais);

state[chatId].htg = htg;
state[chatId].total = total;

// SAVE DB
db.run(`
INSERT INTO transactions
(order_id, user_id, service, amount, method, status, date)
VALUES (?, ?, ?, ?, ?, ?, ?)`,
[
orderId,
chatId,
state[chatId].service,
state[chatId].amount,
text,
"PENDING",
now()
]);

return bot.sendMessage(chatId,
`📩 Informations de paiement :

${paymentInfo[text]}

💰 Total: ${total.toFixed(2)} HTG

📦 Order ID: ${orderId}

📸 Envoyez la preuve (photo)`);
}
});

// ================= PHOTO =================
bot.on('photo', (msg) => {
const chatId = msg.chat.id;

if (!state[chatId] || state[chatId].step !== "proof") return;

const photo = msg.photo[msg.photo.length - 1].file_id;

// update status
db.run(
`UPDATE transactions SET status = "PROOF_RECEIVED" WHERE order_id = ?`,
[state[chatId].orderId]
);

bot.sendMessage(chatId, "⏳ Preuve reçue. En attente validation.");

bot.sendMessage(ADMIN_ID,
`🚨 NEW TRANSACTION

Order: ${state[chatId].orderId}
User: ${chatId}
Service: ${state[chatId].service}
Amount: ${state[chatId].amount}$`,
{ caption: photo });

state[chatId].step = "done";
});

// ================= ADMIN /DONE FIX =================
bot.onText(/\/done (.+)/, (msg, match) => {

if (msg.chat.id != ADMIN_ID) return;

const orderId = match[1];

db.get(
`SELECT * FROM transactions WHERE order_id = ?`,
[orderId],
(err, row) => {

if (!row) {
return bot.sendMessage(ADMIN_ID, "❌ Order non trouvé");
}

// update status
db.run(
`UPDATE transactions SET status = "DONE" WHERE order_id = ?`,
[orderId]
);

bot.sendMessage(row.user_id, receipt(row));
bot.sendMessage(ADMIN_ID, "✅ Reçu envoyé");
});
});

// ================= SAFE =================
process.on('uncaughtException', console.log);
process.on('unhandledRejection', console.log);

console.log("🚀 Gonaf+ V8.1 CLEAN ONLINE");
