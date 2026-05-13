process.env.NTBA_FIX_319 = 1;

const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();

const bot = new TelegramBot(process.env.BOT_TOKEN, {
polling: { autoStart: true }
});

const ADMIN_ID = process.env.ADMIN_ID;

// ================= DB =================
const db = new sqlite3.Database('./gonaf.db');

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
"PayPal": process.env.PAYPAL1_INFO,
"Pana": process.env.PANA_INFO,
"Cash App": process.env.CASHAPP_INFO,
"Wise": process.env.WISE_INFO
};

// ================= STATE =================
let state = {};
let counter = 0;

// ================= HELPERS =================
function now() {
return new Date().toLocaleString("fr-FR", {
timeZone: "America/Port-au-Prince"
});
}

function genId() {
counter++;
return `GNF-${counter}`;
}

function getMethods(service) {
return ["Moncash", "PayPal", "Cash App", "Pana", "Wise"]
.filter(m => m !== service);
}

function header() {
return `📊 Taux: ${taux.toFixed(2)} HTG/USD | 💸 Frais: ${(frais * 100)}%`;
}

function calcTotal(amount, method) {
const usd = amount;

if (method === "Moncash") {
const htg = usd * taux;
return {
currency: "HTG",
total: htg * (1 + frais)
};
}

return {
currency: "USD",
total: usd * (1 + frais)
};
}

function receipt(row, totalObj) {
return `
━━━━━━━━━━━━━━━
🧾 REÇU GONAF+

📦 Order: ${row.order_id}
👤 Client: ${row.user_id}
💼 Service: ${row.service}

💳 Méthode: ${row.method}
💵 Total: ${totalObj.total.toFixed(2)} ${totalObj.currency}

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
`👋 BIENVENUE SUR GONAF+

💳 Choisissez votre service :`,
{
reply_markup: {
inline_keyboard: [
[{ text: "💙 PayPal", callback_data: "PayPal" }],
[{ text: "💸 Cash App", callback_data: "Cash App" }],
[{ text: "🟣 Pana", callback_data: "Pana" }],
[{ text: "💳 Wise", callback_data: "Wise" }]
]
}
});
});

// ================= SERVICE =================
bot.on('callback_query', (q) => {

const chatId = q.message.chat.id;
const data = q.data;

if (!["PayPal", "Cash App", "Pana", "Wise"].includes(data)) return;

bot.answerCallbackQuery(q.id);

state[chatId] = state[chatId] || {};
state[chatId].service = data;
state[chatId].step = "amount";

bot.sendMessage(chatId, "💰 Entrez le montant en USD :");
});

// ================= MESSAGE FLOW =================
bot.on('message', (msg) => {

const chatId = msg.chat.id;
const text = msg.text;

if (!text || text.startsWith('/')) return;
if (!state[chatId]) return;

// AMOUNT STEP
if (state[chatId].step === "amount") {

const usd = parseFloat(text);

if (isNaN(usd)) {
return bot.sendMessage(chatId, "❌ Montant invalide");
}

state[chatId].amount = usd;
state[chatId].step = "method";

return bot.sendMessage(chatId,
header() + "\n💳 Choisissez méthode de paiement :",
{
reply_markup: {
inline_keyboard: getMethods(state[chatId].service).map(m => ([{
text: m,
callback_data: "method_" + m
}]))
}
});
}
});

// ================= METHOD =================
bot.on('callback_query', (q) => {

const chatId = q.message.chat.id;
const data = q.data;

if (!data.startsWith("method_")) return;

const method = data.replace("method_", "");

bot.answerCallbackQuery(q.id);

const orderId = genId();

state[chatId].method = method;
state[chatId].orderId = orderId;
state[chatId].step = "proof";

const totalObj = calcTotal(state[chatId].amount, method);

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
method,
"PENDING",
now()
]);

bot.sendMessage(chatId,
`📩 Informations de paiement :

${paymentInfo[method]}

💰 Total: ${totalObj.total.toFixed(2)} ${totalObj.currency}

📦 Order ID: ${orderId}

📸 Envoyez la preuve de paiement (photo)`);
});

// ================= PHOTO =================
bot.on('photo', (msg) => {

const chatId = msg.chat.id;

if (!state[chatId] || state[chatId].step !== "proof") return;

db.run(
`UPDATE transactions SET status = "PROOF_RECEIVED" WHERE order_id = ?`,
[state[chatId].orderId]
);

bot.sendMessage(chatId, "⏳ Preuve reçue.");

bot.sendMessage(ADMIN_ID,
`🚨 NEW ORDER
Order: ${state[chatId].orderId}
User: ${chatId}
Service: ${state[chatId].service}
Amount: ${state[chatId].amount}`);
});

// ================= ADMIN RECEIVED =================
bot.onText(/^\/received (GNF-\d+)$/, (msg, match) => {

if (msg.chat.id != ADMIN_ID) return;

db.get(`SELECT * FROM transactions WHERE order_id = ?`, [match[1]], (err, row) => {

if (!row) return bot.sendMessage(ADMIN_ID, "❌ Order not found");

bot.sendMessage(row.user_id, "📩 Preuve reçue.");
bot.sendMessage(ADMIN_ID, "✅ Received sent");
});
});

// ================= ADMIN CONFIRM =================
bot.onText(/^\/confirm (GNF-\d+)$/, (msg, match) => {

if (msg.chat.id != ADMIN_ID) return;

db.run(`UPDATE transactions SET status = "CONFIRMED" WHERE order_id = ?`, [match[1]]);

bot.sendMessage(ADMIN_ID, "🔎 Confirmed");
});

// ================= ADMIN DONE =================
bot.onText(/^\/done (GNF-\d+)$/, (msg, match) => {

if (msg.chat.id != ADMIN_ID) return;

db.get(`SELECT * FROM transactions WHERE order_id = ?`, [match[1]], (err, row) => {

if (!row) return bot.sendMessage(ADMIN_ID, "❌ Order not found");

const totalObj = calcTotal(row.amount, row.method);

db.run(`UPDATE transactions SET status = "DONE" WHERE order_id = ?`, [match[1]]);

bot.sendMessage(row.user_id, receipt(row, totalObj));
bot.sendMessage(ADMIN_ID, "✅ Done + receipt sent");
});
});

// ================= SAFE =================
process.on('uncaughtException', console.log);
process.on('unhandledRejection', console.log);

console.log("🚀 V8.3 FINAL ONLINE");
