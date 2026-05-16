process.env.NTBA_FIX_319 = 1;

const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();

const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: true
});

const ADMIN_ID = process.env.ADMIN_ID;

// ================= DATABASE =================
const db = new sqlite3.Database('./gonaf.db');

db.serialize(() => {
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
});

// ================= VARIABLES =================
const taux = parseFloat(process.env.TAUX) - 2;
const frais = parseFloat(process.env.FRAIS);

// ================= PAYMENT INFOS =================
const paymentInfo = {
  "Moncash": process.env.MONCASH_INFO,
  "PayPal": process.env.PAYPAL_INFO,
  "Pana": process.env.PANA_INFO,
  "Cash App": process.env.CASHAPP_INFO,
  "Wise": process.env.WISE_INFO
};

// ================= STATES =================
let userState = {};
let orderCounter = 1;

// ================= HELPERS =================
function now() {
  return new Date().toLocaleString("fr-FR", {
    timeZone: "America/Port-au-Prince"
  });
}

function generateOrderId() {
  return `GNF-${orderCounter++}`;
}

function getMethods(service) {
  return ["Moncash", "PayPal", "Pana", "Cash App", "Wise"]
    .filter(m => m !== service);
}

function calcTotal(amount, method) {

  // MONCASH = HTG
  if (method === "Moncash") {

    const htg = amount * taux;
    const total = htg + (htg * frais);

    return {
      total: total.toFixed(2),
      currency: "HTG"
    };
  }

  // OTHERS = USD
  const total = amount + (amount * frais);

  return {
    total: total.toFixed(2),
    currency: "USD"
  };
}

function receipt(data, totalData) {

  return `
━━━━━━━━━━━━━━━
🧾 REÇU GONAF+

📦 ID Commande : ${data.order_id}

👤 Client ID : ${data.user_id}

💼 Service :
${data.service}

💳 Méthode :
${data.method}

💰 Montant :
${totalData.total} ${totalData.currency}

📅 Date :
${data.date}

━━━━━━━━━━━━━━━
📞 Support WhatsApp
+1 849 785 7751
━━━━━━━━━━━━━━━
`;
}

// ================= START =================
bot.onText(/\/start/, (msg) => {

  const chatId = msg.chat.id;

  userState[chatId] = {};

  bot.sendMessage(
    chatId,
    `👋 Bienvenue sur Gonaf+

Votre solution de recharge rapide, sécurisée et disponible 24/7.

💳 Veuillez sélectionner le service que vous souhaitez recharger :`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "💳 Recharge Wise", callback_data: "Wise" }],
          [{ text: "💙 Recharge PayPal", callback_data: "PayPal" }],
          [{ text: "🟣 Recharge Pana", callback_data: "Pana" }],
          [{ text: "💸 Recharge Cash App", callback_data: "Cash App" }]
        ]
      }
    }
  );
});

// ================= CALLBACKS =================
bot.on('callback_query', (query) => {

  const chatId = query.message.chat.id;
  const data = query.data;

  bot.answerCallbackQuery(query.id);

  // ===== SERVICE =====
  if (["Wise", "PayPal", "Pana", "Cash App"].includes(data)) {

    userState[chatId] = {
      service: data,
      step: "amount"
    };

    return bot.sendMessage(
      chatId,
      `💰 Veuillez entrer le montant que vous souhaitez recharger (USD).`
    );
  }

  // ===== PAYMENT METHOD =====
  if (data.startsWith("method_")) {

    const method = data.replace("method_", "");

    userState[chatId].method = method;
    userState[chatId].step = "proof";

    const amount = userState[chatId].amount;

    const totalData = calcTotal(amount, method);

    const orderId = generateOrderId();

    userState[chatId].orderId = orderId;

    // SAVE DB
    db.run(`
      INSERT INTO transactions
      (order_id, user_id, service, amount, method, status, date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      orderId,
      chatId,
      userState[chatId].service,
      amount,
      method,
      "PENDING",
      now()
    ]);

    return bot.sendMessage(
      chatId,
      `📩 Informations de paiement

${paymentInfo[method]}

━━━━━━━━━━━━━━━
📊 Taux du jour :
${taux.toFixed(2)} HTG/USD

💸 Frais Gonaf+ :
${(frais * 100)}%

💰 Total à envoyer :
${totalData.total} ${totalData.currency}

📦 ID Commande :
${orderId}
━━━━━━━━━━━━━━━

📸 Veuillez maintenant envoyer une capture ou photo de votre paiement afin de finaliser votre commande.`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "📞 Support WhatsApp",
                url: "https://wa.me/18497857751"
              }
            ]
          ]
        }
      }
    );
  }

});

// ================= TEXT FLOW =================
bot.on('message', (msg) => {

  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) return;
  if (text.startsWith('/')) return;

  if (!userState[chatId]) return;

  // ===== AMOUNT =====
  if (userState[chatId].step === "amount") {

    const usd = parseFloat(text);

    if (isNaN(usd)) {

      return bot.sendMessage(
        chatId,
        `❌ Montant invalide.

Veuillez entrer un montant correct en USD.`
      );
    }

    userState[chatId].amount = usd;
    userState[chatId].step = "method";

    return bot.sendMessage(
      chatId,
      `💳 Veuillez choisir votre méthode de paiement :`,
      {
        reply_markup: {
          inline_keyboard: getMethods(userState[chatId].service)
            .map(method => ([
              {
                text: method,
                callback_data: `method_${method}`
              }
            ]))
        }
      }
    );
  }

});

// ================= PHOTO =================
bot.on('photo', (msg) => {

  const chatId = msg.chat.id;

  if (!userState[chatId]) return;
  if (userState[chatId].step !== "proof") return;

  const photo = msg.photo[msg.photo.length - 1].file_id;

  db.run(
    `UPDATE transactions SET status = "PROOF_RECEIVED" WHERE order_id = ?`,
    [userState[chatId].orderId]
  );

  bot.sendMessage(
    chatId,
    `✅ Votre preuve de paiement a bien été reçue.

Notre équipe procède actuellement à la vérification de votre transaction.`
  );

  // SEND PHOTO TO ADMIN
  bot.sendPhoto(
    ADMIN_ID,
    photo,
    {
      caption:
`🚨 NOUVELLE PREUVE

📦 Order :
${userState[chatId].orderId}

👤 Client ID :
${chatId}

💼 Service :
${userState[chatId].service}

💳 Méthode :
${userState[chatId].method}

💰 Montant :
${userState[chatId].amount}$

📅 ${now()}`
    }
  );

});

// ================= RECEIVED =================
bot.onText(/^\/received (GNF-\d+)$/, (msg, match) => {

  if (msg.chat.id != ADMIN_ID) return;

  const orderId = match[1];

  db.get(
    `SELECT * FROM transactions WHERE order_id = ?`,
    [orderId],
    (err, row) => {

      if (!row) {

        return bot.sendMessage(
          ADMIN_ID,
          `❌ Commande introuvable.`
        );
      }

      db.run(
        `UPDATE transactions SET status = "RECEIVED" WHERE order_id = ?`,
        [orderId]
      );

      bot.sendMessage(
        row.user_id,
        `📩 Nous avons bien reçu votre preuve de paiement.

Votre transaction est actuellement en attente de validation.`
      );

      bot.sendMessage(
        ADMIN_ID,
        `✅ Notification envoyée au client.`
      );

    }
  );

});

// ================= CONFIRM =================
bot.onText(/^\/confirm (GNF-\d+)$/, (msg, match) => {

  if (msg.chat.id != ADMIN_ID) return;

  const orderId = match[1];

  db.get(
    `SELECT * FROM transactions WHERE order_id = ?`,
    [orderId],
    (err, row) => {

      if (!row) {

        return bot.sendMessage(
          ADMIN_ID,
          `❌ Commande introuvable.`
        );
      }

      db.run(
        `UPDATE transactions SET status = "CONFIRMED" WHERE order_id = ?`,
        [orderId]
      );

      bot.sendMessage(
        row.user_id,
        `🔎 Votre transaction est actuellement en cours de vérification par notre équipe.`
      );

      bot.sendMessage(
        ADMIN_ID,
        `✅ Confirmation envoyée au client.`
      );

    }
  );

});

// ================= DONE =================
bot.onText(/^\/done (GNF-\d+)$/, (msg, match) => {

  if (msg.chat.id != ADMIN_ID) return;

  const orderId = match[1];

  db.get(
    `SELECT * FROM transactions WHERE order_id = ?`,
    [orderId],
    (err, row) => {

      if (!row) {

        return bot.sendMessage(
          ADMIN_ID,
          `❌ Commande introuvable.`
        );
      }

      const totalData = calcTotal(row.amount, row.method);

      db.run(
        `UPDATE transactions SET status = "DONE" WHERE order_id = ?`,
        [orderId]
      );

      bot.sendMessage(
        row.user_id,
        `✅ Votre recharge a été effectuée avec succès.\n\n${receipt(row, totalData)}`
      );

      bot.sendMessage(
        ADMIN_ID,
        `✅ Transaction terminée et reçu envoyé.`
      );

    }
  );

});

// ================= SAFE =================
process.on('uncaughtException', console.log);
process.on('unhandledRejection', console.log);

console.log("🚀 GONAF+ BOT ONLINE");
