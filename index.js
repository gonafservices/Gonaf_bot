const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();

const bot = new TelegramBot('8600225549:AAF5LHT9bLcQV2zNeNWJjPDzDaP-JFT59Eg', { polling: true });
const ADMIN_ID = '8085059761';

// ================= DATABASE =================
const db = new sqlite3.Database('./gonaf.db');

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

// ================= CONFIG =================
const frais = 0.06;

const methods = [
"Moncash",
"Wise",
"PayPal 1",
"PayPal 2",
"Cash App",
"Pana"
];

const paymentInfo = {
"Moncash": "Moncash : Berlanadina Descieux\nNuméro : +509 XXXX XXXX",

"PayPal 1": "PayPal 1 : Kaysha Mariah Desrosiers\nEmail : kayshaout22@gmail.com",

"PayPal 2": "PayPal 2 : Emmanuel Desrosiers\nEmail : xpandacrew034@gmail.com",

"Cash App": "Cash App : $JayChrist002",

"Pana": "Pana : Emmanuel Desrosiers\nNuméro : +1 849 785 7751\nEmail : xpandacrew034@gmail.com",

"Wise": "Wise : Guerrier R. Yolla\nEmail : hermitemarie@gmail.com"
};

// ================= USER STATE =================
let state = {};
let inactivityTimers = {};

// reset inactivity
function resetTimer(chatId) {
if (inactivityTimers[chatId]) clearTimeout(inactivityTimers[chatId]);

inactivityTimers[chatId] = setTimeout(() => {
delete state[chatId];
bot.sendMessage(chatId, "⏳ Inactivité détectée. Veuillez relancer /start pour recommencer.");
}, 5 * 60 * 1000);
}

// ================= START =================
bot.onText(/\/start/, (msg) => {
const chatId = msg.chat.id;

state[chatId] = {};

resetTimer(chatId);

bot.sendMessage(chatId,
"Bienvenue sur Gonaf+\n\nChoisissez votre service de recharge :",
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

// ================= SERVICE CHOICE =================
bot.on('message', (msg) => {
const chatId = msg.chat.id;
const text = msg.text;

if (!state[chatId]) state[chatId] = {};

resetTimer(chatId);

// ignore commands
if (text.startsWith('/')) return;

// ================= STEP 1: SERVICE =================
const serviceMap = {
"Recharge Wise": "Wise",
"Recharge PayPal": "PayPal",
"Recharge Cash App": "Cash App",
"Recharge Pana": "Pana",
"Recharge Moncash": "Moncash"
};

if (serviceMap[text]) {
state[chatId].service = serviceMap[text];

bot.sendMessage(chatId, "Entrez le montant en USD :");
return;
}

// ================= STEP 2: AMOUNT =================
if (!state[chatId].amount && state[chatId].service) {

const amount = parseFloat(text);

if (isNaN(amount)) {
bot.sendMessage(chatId, "Montant invalide.");
return;
}

state[chatId].amount = amount;

// méthode paiement (Moncash toujours en premier)
let availableMethods = ["Moncash"];

methods.forEach(m => {
if (m !== "Moncash") availableMethods.push(m);
});

state[chatId].methods = availableMethods;

bot.sendMessage(chatId,
"Choisissez une méthode de paiement :",
{
reply_markup: {
keyboard: availableMethods.map(m => [m]),
resize_keyboard: true
}
});

return;
}

// ================= STEP 3: PAYMENT METHOD =================
if (state[chatId].amount && state[chatId].service && !state[chatId].method) {

if (!methods.includes(text)) {
bot.sendMessage(chatId, "Veuillez choisir une méthode valide.");
return;
}

state[chatId].method = text;

// envoyer info paiement
bot.sendMessage(chatId,
"Voici les informations de paiement :\n\n" +
paymentInfo[text] +
"\n\nVeuillez envoyer votre preuve de paiement (photo)."
);

return;
}
});

// ================= PROOF (PHOTO) =================
bot.on('photo', (msg) => {
const chatId = msg.chat.id;

if (!state[chatId]?.method) return;

const photo = msg.photo[msg.photo.length - 1].file_id;

const t = new Date().toISOString();

db.run(`
INSERT INTO transactions (user_id, service, amount, method, status, date)
VALUES (?, ?, ?, ?, ?, ?)`,
[
chatId,
state[chatId].service,
state[chatId].amount,
state[chatId].method,
"PENDING",
t
]);

bot.sendMessage(chatId,
"Preuve reçue. Nous allons vérifier votre paiement.");

bot.sendMessage(ADMIN_ID,
"Nouvelle transaction\n\n" +
"User: " + chatId + "\n" +
"Service: " + state[chatId].service + "\n" +
"Montant: " + state[chatId].amount + "\n" +
"Méthode: " + state[chatId].method,
{ caption: photo });

state[chatId].pending = true;
});

// ================= ADMIN COMMANDS =================
bot.onText(/\/received (.+)/, (msg, match) => {
if (msg.chat.id != ADMIN_ID) return;

bot.sendMessage(match[1], "Nous avons reçu votre preuve de paiement.");
});

bot.onText(/\/confirm (.+)/, (msg, match) => {
if (msg.chat.id != ADMIN_ID) return;

bot.sendMessage(match[1], "Votre preuve est en cours de validation.");
});

bot.onText(/\/done (.+)/, (msg, match) => {
if (msg.chat.id != ADMIN_ID) return;

const userId = match[1];

const date = new Date().toLocaleString("fr-FR");

bot.sendMessage(userId,
"Transaction terminée avec succès.\n\n" +
"ID: " + userId + "\n" +
"Date: " + date);

bot.sendMessage(ADMIN_ID, "Transaction marquée comme terminée.");
});

// ================= AUTO RETURN =================
console.log("Gonaf+ v3 actif 🚀");
