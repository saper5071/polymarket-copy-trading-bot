import { ClobClient } from '@polymarket/clob-client';
import { UserActivityInterface, UserPositionInterface } from '../interfaces/User';
import { ENV } from '../config/env';
import { getUserActivityModel } from '../models/userHistory';
import fetchData from '../utils/fetchData';
import spinner from '../utils/spinner';
import getMyBalance from '../utils/getMyBalance';
import postOrder from '../utils/postOrder';
import axios from 'axios'; // per Telegram

const USER_ADDRESS = ENV.USER_ADDRESS;
const PROXY_WALLET = ENV.PROXY_WALLET;
const PERSONAL_BUDGET = ENV.PERSONAL_BUDGET; // budget personale (USD)
const RETRY_LIMIT = ENV.RETRY_LIMIT;

let temp_trades: UserActivityInterface[] = [];
const UserActivity = getUserActivityModel(USER_ADDRESS);

// Legge le transazioni da copiare dal DB
const readTempTrade = async () => {
  temp_trades = (await UserActivity.find({
    $and: [
      { type: 'TRADE' },
      { bot: false },
      { botExcutedTime: { $lt: RETRY_LIMIT } }
    ]
  }).exec()).map(t => t as UserActivityInterface);
};

// Funzione principale di esecuzione ordini
const doTrading = async (clobClient: ClobClient) => {
  for (const trade of temp_trades) {
    console.log('Trade da copiare:', trade);

    // Calcolo bilanci
    const my_balance = await getMyBalance(PROXY_WALLET);
    const user_balance = await getMyBalance(USER_ADDRESS);
    console.log('Saldo mio (USDC):', my_balance, ' | Saldo utente copiato (USDC):', user_balance);

    // **Filtro operazioni <1 USD**
    const usdAmount = trade.size * trade.price;
    if (usdAmount < 1) {
      console.log('Importo USD < 1, operazione scartata.');
      await UserActivity.updateOne({ _id: trade._id }, { bot: true });
      continue;
    }

    // **Scala proporzionale al budget personale**
    const scale = PERSONAL_BUDGET / user_balance;
    // Riduciamo la size dell'ordine proporzionalmente (almeno 1 azione)
    trade.size = Math.max(1, Math.floor(trade.size * scale));
    console.log('Share scalate a', trade.size, 'per budget personale', PERSONAL_BUDGET);

    // Esegue ordine di merge/buy/sell tramite postOrder
    const my_positions: UserPositionInterface[] = await fetchData(
      `https://data-api.polymarket.com/positions?user=${PROXY_WALLET}`
    );
    const user_positions: UserPositionInterface[] = await fetchData(
      `https://data-api.polymarket.com/positions?user=${USER_ADDRESS}`
    );
    const my_position = my_positions.find(p => p.conditionId === trade.conditionId);
    const user_position = user_positions.find(p => p.conditionId === trade.conditionId);

    if (trade.side === 'BUY') {
      if (user_position && my_position && my_position.asset !== trade.asset) {
        await postOrder(clobClient, 'merge', my_position, user_position, trade, my_balance, user_balance);
      } else {
        await postOrder(clobClient, 'buy', my_position, user_position, trade, my_balance, user_balance);
      }
    } else if (trade.side === 'SELL') {
      await postOrder(clobClient, 'sell', my_position, user_position, trade, my_balance, user_balance);
    } else {
      console.log('Tipo di operazione non supportato');
      await UserActivity.updateOne({ _id: trade._id }, { bot: true });
    }
  }
};

// Loop continuo di controllo e trading
const tradeExecutor = async (clobClient: ClobClient) => {
  console.log('Copy Trading in esecuzione...');
  await readTempTrade(); // Iniziale
  while (true) {
    await readTempTrade();
    if (temp_trades.length > 0) {
      spinner.stop();
      await doTrading(clobClient);
    } else {
      spinner.start('In attesa di nuove transazioni...');
    }
    await new Promise(res => setTimeout(res, ENV.FETCH_INTERVAL * 1000));
  }
};

export default tradeExecutor;
