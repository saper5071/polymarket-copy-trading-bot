import { ClobClient } from '@polymarket/clob-client';
import { UserActivityInterface, UserPositionInterface } from '../interfaces/User';
import { ENV } from '../config/env';
import { getUserActivityModel } from '../models/userHistory';
import fetchData from '../utils/fetchData';
import getMyBalance from '../utils/getMyBalance';
import postOrder from '../utils/postOrder';

import axios from 'axios';

const USER_ADDRESS = ENV.USER_ADDRESS;
const PROXY_WALLET = ENV.PROXY_WALLET;
const RETRY_LIMIT = ENV.RETRY_LIMIT;
const UserActivity = getUserActivityModel(USER_ADDRESS);

// Funzione per inviare un messaggio Telegram
const sendTelegramMessage = async (message: string) => {
  if (!ENV.TELEGRAM_BOT_TOKEN || !ENV.TELEGRAM_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/sendMessage`;
  await axios.post(url, {
    chat_id: ENV.TELEGRAM_CHAT_ID,
    text: message,
  });
};

let temp_trades: UserActivityInterface[] = [];

const readTempTrade = async () => {
  temp_trades = (
    await UserActivity.find({
      $and: [{ type: 'TRADE' }, { bot: false }, { botExcutedTime: { $lt: RETRY_LIMIT } }],
    }).exec()
  ).map((trade) => trade as UserActivityInterface);
};

const doTrading = async (clobClient: ClobClient) => {
  for (const trade of temp_trades) {
    // Log e notifica tentativo di operazione
    console.log('Trade to copy:', trade);
    await sendTelegramMessage(
      `🔄 Tentativo operazione: *${trade.side}* sulla condizione ${trade.conditionId} ` +
        `(volume USDC: ${trade.usdcSize ?? (trade.size * trade.price).toFixed(2)})`
    );

    // Calcola importo USDC dell'operazione user
    const tradeAmount: number =
      trade.side === 'BUY'
        ? Number(trade.usdcSize)
        : Number(trade.size) * Number(trade.price);

    // Se l'importo è inferiore a 10 USDC, ignoriamo l'operazione
    if (tradeAmount < 10) {
      console.log(`Operazione ignorata (${tradeAmount.toFixed(2)} USDC < 10 USDC)`);
      await UserActivity.updateOne({ _id: trade._id }, { bot: true });
      await sendTelegramMessage(
        `⚠️ Operazione ignorata: importo ${tradeAmount.toFixed(2)} USDC inferiore alla soglia di 10 USDC.`
      );
      continue; // Passa all'operazione successiva
    }

    // Ottieni posizioni e bilanci
    const my_positions: UserPositionInterface[] = await fetchData(
      `https://data-api.polymarket.com/positions?user=${PROXY_WALLET}`
    );
    const user_positions: UserPositionInterface[] = await fetchData(
      `https://data-api.polymarket.com/positions?user=${USER_ADDRESS}`
    );
    const my_position = my_positions.find((position) => position.conditionId === trade.conditionId);
    const user_position = user_positions.find(
      (position) => position.conditionId === trade.conditionId
    );
    const my_balance = await getMyBalance(PROXY_WALLET); // Saldo attuale in USDC del mio wallet
    const user_balance = await getMyBalance(USER_ADDRESS); // Saldo attuale in USDC dell'utente copiato

    console.log('My current balance:', my_balance);
    console.log('User current balance:', user_balance);

    // Esegue l'operazione sul CLOB Polymarket (buy o sell)
    if (trade.side === 'BUY') {
      if (user_position && my_position && my_position.asset !== trade.asset) {
        // Strategia di merge (caso raro)
        await postOrder(
          clobClient,
          'merge',
          my_position,
          user_position,
          trade,
          my_balance,
          user_balance
        );
      } else {
        await postOrder(
          clobClient,
          'buy',
          my_position,
          user_position,
          trade,
          my_balance,
          user_balance
        );
      }
    } else if (trade.side === 'SELL') {
      await postOrder(
        clobClient,
        'sell',
        my_position,
        user_position,
        trade,
        my_balance,
        user_balance
      );
    } else {
      console.log('Tipologia operazione non supportata:', trade.side);
      await UserActivity.updateOne(
        { _id: trade._id },
        { bot: true, botExcutedTime: trade.botExcutedTime + 1 }
      );
    }
    // La notifica di successo/fallimento è gestita all'interno di postOrder
  }
};

const tradeExecutor = async (clobClient: ClobClient) => {
  while (true) {
    await readTempTrade(); // Legge le nuove operazioni da copiare
    await doTrading(clobClient); // Esegue le operazioni
    // Attendi prima di ripetere il ciclo
    await new Promise((resolve) => setTimeout(resolve, ENV.FETCH_INTERVAL * 1000));
  }
};

export default tradeExecutor;
