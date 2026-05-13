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

// ================= START (INLINE) =================
bot.onText(/\/start/, (msg) => {
const chatId = msg.chat.id;

state[chatId] = {};

bot.sendMessage(chatId,
`👋 BIENVENUE SUR GONAF+

💳 Recharge rapide & sécurisée`,
{
reply_markup: {
inline_keyboard: [
[{ text: "💳 Wise", callback_data: "Wise" }],
[{ text: "💙 PayPal", callback_data: "PayPal" }],
[{ text: "💸 Cash App", callback_data: "Cash App" }],
[{ text: "🟣 Pana", callback_data: "Pana" }],
[{ text: "🏦 Moncash", callback_data: "Moncash" }]
]
}
});
});

// ================= INLINE HANDLER =================
bot.on('callback_query', (q) => {
const chatId = q.message.chat.id;
const data = q.data;

bot.answerCallbackQuery(q.id);

state[chatId] = state[chatId] || {};
state[chatId].service = data;
state[chatId].step = "amount";

bot.sendMessage(chatId, "💰 Entrez le montant en USD :");
});

// ================= FLOW =================
bot.on('message', (msg) => {
const chatId = msg.chat.id;
const text = msg.text;

if (!text || text.startsWith('/')) return;

if (!state[chatId]) state[chatId] = {};

// ========= AMOUNT =========
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
callback_data: `method_${m}`
}]))
}
});
}
});

// ================= METHOD INLINE =================
bot.on('callback_query', (q) => {

const chatId = q.message.chat.id;
const data = q.data;

if (!data.startsWith("method_")) return;

const method = data.replace("method_", "");

bot.answerCallbackQuery(q.id);

state[chatId].method = method;
state[chatId].step = "proof";

const orderId = genId();
state[chatId].orderId = orderId;

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
method,
"PENDING",
now()
]);

bot.sendMessage(chatId,
`📩 Paiement:

${paymentInfo[method]}

💰 Total: ${total.toFixed(2)} HTG

📦 Order ID: ${orderId}

📸 Envoyez la preuve (photo)`);
});
});

// ================= PHOTO =================
bot.on('photo', (msg) => {
const chatId = msg.chat.id;

if (!state[chatId] || state[chatId].step !== "proof") return;

db.run(
`UPDATE transactions SET status = "PROOF_RECEIVED" WHERE order_id = ?`,
[state[chatId].orderId]
);

bot.sendMessage(chatId, "⏳ Preuve reçue. En attente validation.");

bot.sendMessage(ADMIN_ID,
`🚨 NEW ORDER
User: ${chatId}
Order: ${state[chatId].orderId}
Service: ${state[chatId].service}
Amount: ${state[chatId].amount}$`);
});

// ================= ADMIN COMMANDS =================
bot.onText(/\/received (GNF-\d+)/, (msg, match) => {
if (msg.chat.id != ADMIN_ID) return;
bot.sendMessage(match[1], "📩 Preuve reçue.");
});

bot.onText(/\/confirm (GNF-\d+)/, (msg, match) => {
if (msg.chat.id != ADMIN_ID) return;
bot.sendMessage(match[1], "🔎 En cours de vérification.");
});

bot.onText(/\/done (GNF-\d+)/, (msg, match) => {
if (msg.chat.id != ADMIN_ID) return;

const orderId = match[1];

db.get(`SELECT * FROM transactions WHERE order_id = ?`, [orderId], (err, row) => {

if (!row) {
return bot.sendMessage(ADMIN_ID, "❌ Order non trouvé");
}

db.run(`UPDATE transactions SET status = "DONE" WHERE order_id = ?`, [orderId]);

bot.sendMessage(row.user_id, receipt(row));
bot.sendMessage(ADMIN_ID, "✅ Reçu envoyé");
});
});

// ================= SAFE =================
process.on('uncaughtException', console.log);
process.on('unhandledRejection', console.log);

console.log("🚀 V8.2 INLINE PRO ONLINE");
