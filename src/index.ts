import connectDB from './config/db';
import { ENV } from './config/env';
import createClobClient from './utils/createClobClient';
import tradeExecutor from './services/tradeExecutor';
import tradeMonitor from './services/tradeMonitor';
import axios from 'axios';
import { getBalance } from './utils/getBalance'; // ← lo creiamo subito dopo

const USER_ADDRESS = ENV.USER_ADDRESS;
const PROXY_WALLET = ENV.PROXY_WALLET;

// Funzione per inviare un messaggio Telegram
const sendTelegramMessage = async (message: string) => {
  if (!ENV.TELEGRAM_BOT_TOKEN || !ENV.TELEGRAM_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await axios.post(url, {
      chat_id: ENV.TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('Errore invio messaggio Telegram:', error);
  }
};

// Esempio di funzione che potresti usare per evitare spese eccessive
async function shouldCopyTrade(tradeUSDC: number, userBalance: number, proxyBalance: number): Promise<number | null> {
  const ratio = proxyBalance / userBalance;
  const max = tradeUSDC * ratio;

  if (max < 1) return null;
  return max;
}

export const main = async () => {
  await connectDB();

  console.log(`Target User Wallet address: ${USER_ADDRESS}`);
  console.log(`My Wallet address: ${PROXY_WALLET}`);

  await sendTelegramMessage(
    `🤖 *Bot CopyTrading Avviato*\nUtente target: ${USER_ADDRESS}\nMio wallet: ${PROXY_WALLET}`
  );

  const clobClient = await createClobClient();

  tradeMonitor();             // Inizia a monitorare le transazioni dell'utente target
  tradeExecutor(clobClient);  // Avvia l'esecuzione delle operazioni da copiare
};

main();
