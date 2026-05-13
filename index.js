process.env.NTBA_FIX_319 = 1;

const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();

// ================= SAFE BOT =================
const bot = new TelegramBot(process.env.BOT_TOKEN, {
polling: {
autoStart: true
}
});

const ADMIN_ID = process.env.ADMIN_ID;

// ================= SAFE DATABASE =================
const db = new sqlite3.Database('/tmp/gonaf.db');

db.run(`
CREATE TABLE IF NOT EXISTS transactions (
id INTEGER PRIMARY KEY AUTOINCREMENT,
user_id TEXT,
service TEXT,
amount REAL,
method TEXT,
status TEXT,
date TEXT
)
`);

// ================= VARIABLES =================
const tauxMarche = parseFloat(process.env.TAUX);
const taux = tauxMarche - 2;

const frais = parseFloat(process.env.FRAIS);

// ================= PAYMENT INFO =================
const paymentInfo = {
"Moncash": "Moncash : Berlanadina Descieux\nNuméro : +509 XXXX XXXX",

"PayPal 1": "PayPal 1 : Kaysha Mariah Desrosiers\nEmail : kayshaout22@gmail.com",

"PayPal 2": "PayPal 2 : Emmanuel Desrosiers\nEmail : xpandacrew034@gmail.com",

"Cash App": "Cash App : $JayChrist002",

"Pana": "Pana : Emmanuel Desrosiers\nNuméro : +1 849 785 7751\nEmail : hermitemarie@gmail.com",

"Wise": "Wise : Guerrier R. Yolla\nEmail : hermitemarie@gmail.com"
};

const methods = Object.keys(paymentInfo);

// ================= STATE =================
let state = {};

// ================= SAFE RESET =================
function init(chatId){
if(!state[chatId]) state[chatId] = {};
}

// ================= START =================
bot.onText(/\/start/, (msg) => {
const chatId = msg.chat.id;

init(chatId);

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

init(chatId);

// ========== SERVICE ==========
const serviceMap = {
"Recharge Wise": "Wise",
"Recharge PayPal": "PayPal",
"Recharge Cash App": "Cash App",
"Recharge Pana": "Pana",
"Recharge Moncash": "Moncash"
};

if (serviceMap[text]) {
state[chatId].service = serviceMap[text];
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

return bot.sendMessage(chatId,
"💳 Choisissez méthode de paiement :",
{
reply_markup: {
keyboard: methods.map(m => [m]),
resize_keyboard: true
}
});
}

// ========== METHOD ==========
if (state[chatId].step === "method") {

if (!methods.includes(text)) {
return bot.sendMessage(chatId, "❌ Méthode invalide.");
}

state[chatId].method = text;
state[chatId].step = "proof";

// calculate
const htg = state[chatId].amount * taux;
const total = htg * (1 + frais);

state[chatId].htg = htg;
state[chatId].total = total;

// send payment info
bot.sendMessage(chatId,
"📩 Informations de paiement :\n\n" +
paymentInfo[text] +
"\n\n💰 Total à payer: " + total.toFixed(2) + " HTG\n\n📸 Envoyez la preuve (photo)");
}
});

// ================= PHOTO PROOF =================
bot.on('photo', (msg) => {
const chatId = msg.chat.id;

if (!state[chatId] || state[chatId].step !== "proof") return;

const photo = msg.photo[msg.photo.length - 1].file_id;

const date = new Date().toLocaleString("fr-FR");

// save DB
db.run(`
INSERT INTO transactions (user_id, service, amount, method, status, date)
VALUES (?, ?, ?, ?, ?, ?)
`,
[
chatId,
state[chatId].service,
state[chatId].amount,
state[chatId].method,
"PENDING",
date
]);

// user msg
bot.sendMessage(chatId, "⏳ Preuve reçue. En attente de validation.");

// admin msg
bot.sendMessage(ADMIN_ID,
"🚨 NOUVELLE TRANSACTION\n\n" +
"ID: " + chatId + "\n" +
"Service: " + state[chatId].service + "\n" +
"Montant: " + state[chatId].amount + "$\n" +
"Méthode: " + state[chatId].method,
{ caption: photo });

state[chatId].step = "done";
});

// ================= ADMIN COMMANDS =================
bot.onText(/\/received (.+)/, (msg, match) => {
if (msg.chat.id != ADMIN_ID) return;
bot.sendMessage(match[1], "📩 Preuve reçue.");
});

bot.onText(/\/confirm (.+)/, (msg, match) => {
if (msg.chat.id != ADMIN_ID) return;
bot.sendMessage(match[1], "🔎 Preuve en vérification.");
});

bot.onText(/\/done (.+)/, (msg, match) => {
if (msg.chat.id != ADMIN_ID) return;

const date = new Date().toLocaleString("fr-FR");

bot.sendMessage(match[1],
"✅ Recharge effectuée\n\nDate: " + date);
});

// ================= ANTI CRASH =================
process.on('uncaughtException', (err) => {
console.log("ERROR:", err);
});

process.on('unhandledRejection', (err) => {
console.log("PROMISE ERROR:", err);
});

console.log("🚀 Gonaf+ v5 STABLE RUNNING");
