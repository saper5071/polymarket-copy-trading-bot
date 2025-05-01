import dotenv from 'dotenv';
dotenv.config();

/**
 * Raccolta di variabili d'ambiente utilizzate dall'applicazione.
 */
export const ENV = {
  USER_ADDRESS: process.env.USER_ADDRESS!,            // Indirizzo del trader da copiare
  PROXY_WALLET: process.env.PROXY_WALLET!,            // Indirizzo del wallet dell'utente che copia
  PRIVATE_KEY: process.env.PRIVATE_KEY!,              // Chiave privata del wallet
  CLOB_HTTP_URL: process.env.CLOB_HTTP_URL!,          // URL HTTP del CLOB Polymarket
  CLOB_WS_URL: process.env.CLOB_WS_URL!,              // URL WebSocket del CLOB Polymarket
  FETCH_INTERVAL: Number(process.env.FETCH_INTERVAL) || 1,       // Intervallo di polling (in sec)
  TOO_OLD_TIMESTAMP: Number(process.env.TOO_OLD_TIMESTAMP) || 1, // Soglia di vecchiaia (in ore)
  RETRY_LIMIT: Number(process.env.RETRY_LIMIT) || 3,             // Numero massimo di tentativi di postOrder

  MONGO_URI: process.env.MONGO_URI!,                    // URI di connessione MongoDB
  RPC_URL: process.env.RPC_URL!,                        // URL RPC per Polygon
  USDC_CONTRACT_ADDRESS: process.env.USDC_CONTRACT_ADDRESS!, // Indirizzo del contratto USDC

  // Variabili per Telegram (token del bot e chat ID del gruppo o utente)
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,  // (es. '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11')
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID       // (es. '-987654321')
};
