import connectDB from './config/db';
import { ENV } from './config/env';
import createClobClient from './utils/createClobClient';
import tradeExecutor from './services/tradeExecutor';
import tradeMonitor from './services/tradeMonitor';

import axios from 'axios';

const USER_ADDRESS = ENV.USER_ADDRESS;
const PROXY_WALLET = ENV.PROXY_WALLET;

// Funzione per inviare un messaggio Telegram (usa axios per chiamare Telegram Bot API)
const sendTelegramMessage = async (message: string) => {
  if (!ENV.TELEGRAM_BOT_TOKEN || !ENV.TELEGRAM_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/sendMessage`;
  await axios.post(url, {
    chat_id: ENV.TELEGRAM_CHAT_ID,
    text: message
  });
};

export const main = async () => {
  await connectDB();

  console.log(`Target User Wallet address: ${USER_ADDRESS}`);
  console.log(`My Wallet address: ${PROXY_WALLET}`);

  // Invia un messaggio Telegram all'avvio del bot
  await sendTelegramMessage(
    `🤖 *Bot CopyTrading Avviato*\nUtente target: ${USER_ADDRESS}\nMio wallet: ${PROXY_WALLET}`
  );

  const clobClient = await createClobClient();

  tradeMonitor();             // Inizia a monitorare le transazioni dell'utente target
  tradeExecutor(clobClient);  // Avvia l'esecuzione delle operazioni da copiare
};

main();
