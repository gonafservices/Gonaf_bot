process.env.NTBA_FIX_319 = 1;

const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();

// ================= BOT =================
const bot = new TelegramBot(process.env.BOT_TOKEN, {
polling: { autoStart: true }
});

const ADMIN_ID = process.env.ADMIN_ID;

// ================= DB (RAILWAY SAFE) =================
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

// ================= PAYMENT INFO (VARIABLES) =================
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

function generateId(){
counter++;
return `GNF-${counter}`;
}

function header(){
return `📊 Taux: ${taux.toFixed(2)} HTG/USD
💸 Frais: ${(frais*100)}%
📞 WhatsApp: +1 849 785 7751`;
}

function getMethods(service){
return ["Moncash","PayPal 1","PayPal 2","Cash App","Pana","Wise"]
.filter(m => m !== service);
}

// ================= START =================
bot.onText(/\/start/, (msg) => {
const chatId = msg.chat.id;

state[chatId] = {};

bot.sendMessage(chatId,
"👋 Bienvenue sur Gonaf+\n\nChoisissez votre service :",
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

// ========== SERVICE ==========
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

return bot.sendMessage(chatId, "💰 Entrez le montant en USD :");
}

// ========== AMOUNT ==========
if (state[chatId].step === "amount") {

const usd = parseFloat(text);

if (isNaN(usd)) {
return bot.sendMessage(chatId, "❌ Montant invalide.");
}

state[chatId].amount = usd;
state[chatId].step = "method";

let methods = getMethods(state[chatId].service);

return bot.sendMessage(chatId,
header() + "\n\n💳 Choisissez méthode de paiement :",
{
reply_markup: {
keyboard: methods.map(m => [m]),
resize_keyboard: true,
one_time_keyboard: true
}
});
}

// ========== METHOD ==========
if (state[chatId].step === "method") {

const methods = ["Moncash","PayPal 1","PayPal 2","Cash App","Pana","Wise"];

if (!methods.includes(text)) {
return bot.sendMessage(chatId, "❌ Méthode invalide.");
}

const orderId = generateId();

state[chatId].method = text;
state[chatId].orderId = orderId;
state[chatId].step = "proof";

const htg = state[chatId].amount * taux;
const total = htg * (1 + frais);

state[chatId].htg = htg;
state[chatId].total = total;

return bot.sendMessage(chatId,
`📩 Informations de paiement :

${paymentInfo[text]}

💰 Montant HTG: ${total.toFixed(2)}

📦 Commande ID: ${orderId}

📸 Envoyez la preuve de paiement (photo)`);
}
});

// ================= PHOTO PROOF =================
bot.on('photo', (msg) => {
const chatId = msg.chat.id;

if (!state[chatId] || state[chatId].step !== "proof") return;

const photo = msg.photo[msg.photo.length - 1].file_id;

const date = now();

// save DB
db.run(`
INSERT INTO transactions (order_id, user_id, service, amount, method, status, date)
VALUES (?, ?, ?, ?, ?, ?, ?)`,
[
state[chatId].orderId,
chatId,
state[chatId].service,
state[chatId].amount,
state[chatId].method,
"PENDING",
date
]);

bot.sendMessage(chatId, "⏳ Preuve reçue. En attente de validation.");

bot.sendMessage(ADMIN_ID,
`🚨 NOUVELLE TRANSACTION

🆔 User: ${chatId}
📦 Order: ${state[chatId].orderId}
💼 Service: ${state[chatId].service}
💵 USD: ${state[chatId].amount}
💳 Method: ${state[chatId].method}`,
{ caption: photo });

state[chatId].step = "done";
});

// ================= ADMIN =================
bot.onText(/\/received (.+)/, (msg, match) => {
if (msg.chat.id != ADMIN_ID) return;
bot.sendMessage(match[1], "📩 Preuve reçue.");
});

bot.onText(/\/confirm (.+)/, (msg, match) => {
if (msg.chat.id != ADMIN_ID) return;
bot.sendMessage(match[1], "🔎 En cours de vérification.");
});

bot.onText(/\/done (.+)/, (msg, match) => {
if (msg.chat.id != ADMIN_ID) return;
bot.sendMessage(match[1], "✅ Recharge effectuée avec succès.");
});

// ================= SAFE =================
process.on('uncaughtException', console.log);
process.on('unhandledRejection', console.log);

console.log("🚀 Gonaf+ V8 ONLINE");
