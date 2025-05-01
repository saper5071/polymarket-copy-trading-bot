import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { UserActivityInterface, UserPositionInterface } from '../interfaces/User';
import { ENV } from '../config/env';
import { getUserActivityModel } from '../models/userHistory';

import axios from 'axios';

const USER_ADDRESS = ENV.USER_ADDRESS;
const RETRY_LIMIT = ENV.RETRY_LIMIT;
const UserActivity = getUserActivityModel(USER_ADDRESS);

// Funzione per inviare un messaggio Telegram
const sendTelegramMessage = async (message: string) => {
  if (!ENV.TELEGRAM_BOT_TOKEN || !ENV.TELEGRAM_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/sendMessage`;
  await axios.post(url, {
    chat_id: ENV.TELEGRAM_CHAT_ID,
    text: message
  });
};

const postOrder = async (
  clobClient: ClobClient,
  condition: string,
  my_position: UserPositionInterface | undefined,
  user_position: UserPositionInterface | undefined,
  trade: UserActivityInterface,
  my_balance: number,
  user_balance: number
) => {
  // [Case 'merge' omitted...]

  // === BUY Strategy ===
  if (condition === 'buy') {
    console.log('Buy Strategy...');
    // Calcola proporzione usando il saldo personale (my_balance) e l'utente copiato (user_balance)
    const originalUserBalance = user_balance + (trade.usdcSize ?? 0);
    const ratio = my_balance / originalUserBalance;
    console.log('ratio', ratio.toFixed(4));
    // Calcola quanto investire in base alla proporzione
    let remaining = (trade.usdcSize ?? 0) * ratio;
    // Se l'importo proporzionale è inferiore a 1 USDC, investiamo 1 USDC minimo
    if (remaining > 0 && remaining < 1) {
      console.log('Importo proporzionale < 1 USDC, imposto a 1 USDC');
      remaining = 1;
    }
    let retry = 0;
    while (remaining > 0 && retry < RETRY_LIMIT) {
      const orderBook = await clobClient.getOrderBook(trade.asset);
      if (!orderBook.asks || orderBook.asks.length === 0) {
        console.log('No asks found');
        await UserActivity.updateOne({ _id: trade._id }, { bot: true });
        break;
      }
      const minPriceAsk = orderBook.asks.reduce((min, ask) =>
        parseFloat(ask.price) < parseFloat(min.price) ? ask : min, orderBook.asks[0]
      );
      console.log('Min price ask:', minPriceAsk);
      if (parseFloat(minPriceAsk.price) - 0.05 > trade.price) {
        console.log('Prezzo troppo alto rispetto all\'operazione dell\'utente - non copio');
        await UserActivity.updateOne({ _id: trade._id }, { bot: true });
        break;
      }
      let order_args;
      // Se il budget rimanente permette di comprare tutte le dimensioni disponibili
      if (remaining <= parseFloat(minPriceAsk.size) * parseFloat(minPriceAsk.price)) {
        order_args = {
          side: Side.BUY,
          tokenID: trade.asset,
          amount: remaining / parseFloat(minPriceAsk.price),
          price: parseFloat(minPriceAsk.price),
        };
      } else {
        // Altrimenti compro tutto ciò che trovo a prezzo minimo
        order_args = {
          side: Side.BUY,
          tokenID: trade.asset,
          amount: parseFloat(minPriceAsk.size),
          price: parseFloat(minPriceAsk.price),
        };
      }
      console.log('Order args:', order_args);
      const signedOrder = await clobClient.createMarketOrder(order_args);
      const resp = await clobClient.postOrder(signedOrder, OrderType.FOK);
      if (resp.success === true) {
        console.log('Ordine BUY eseguito con successo:', resp);
        retry = 0;
        remaining -= order_args.amount * order_args.price;
      } else {
        retry += 1;
        console.log('Errore esecuzione ordine BUY, ritento...', resp);
      }
    }
    // Segnala completamento o fallimento al database e invia notifica Telegram
    if (retry >= RETRY_LIMIT) {
      await UserActivity.updateOne({ _id: trade._id }, { bot: true, botExcutedTime: retry });
      await sendTelegramMessage(`❌ Operazione *BUY* condizione ${trade.conditionId} fallita dopo ${retry} tentativi.`);
    } else {
      await UserActivity.updateOne({ _id: trade._id }, { bot: true });
      await sendTelegramMessage(`✅ Operazione *BUY* condizione ${trade.conditionId} completata con successo.`);
    }
  }
  // === SELL Strategy ===
  else if (condition === 'sell') {
    console.log('Sell Strategy...');
    let remaining = 0;
    if (!my_position) {
      console.log('Nessuna posizione da vendere');
      await UserActivity.updateOne({ _id: trade._id }, { bot: true });
      await sendTelegramMessage(`⚠️ Operazione *SELL* condizione ${trade.conditionId} ignorata: nessuna posizione da vendere.`);
      return;
    } else if (!user_position) {
      remaining = my_position.size;
    } else {
      const ratio = (trade.size ?? 0) / ((user_position.size ?? 0) + (trade.size ?? 0));
      console.log('ratio', ratio.toFixed(4));
      remaining = (my_position.size ?? 0) * ratio;
      // Se il risultato proporzionale è < 1 USDC, vendiamo in modo da ottenere 1 USDC
      if (remaining > 0 && remaining * (trade.price ?? 0) < 1) {
        console.log('Importo proporzionale < 1 USDC, vendo quantità per 1 USDC');
        remaining = 1 / (trade.price ?? 1);
      }
    }
    let retry = 0;
    while (remaining > 0 && retry < RETRY_LIMIT) {
      const orderBook = await clobClient.getOrderBook(trade.asset);
      if (!orderBook.bids || orderBook.bids.length === 0) {
        console.log('No bids found');
        await UserActivity.updateOne({ _id: trade._id }, { bot: true });
        break;
      }
      const maxPriceBid = orderBook.bids.reduce((max, bid) =>
        parseFloat(bid.price) > parseFloat(max.price) ? bid : max, orderBook.bids[0]
      );
      console.log('Max price bid:', maxPriceBid);
      let order_args;
      if (remaining <= parseFloat(maxPriceBid.size)) {
        order_args = {
          side: Side.SELL,
          tokenID: trade.asset,
          amount: remaining,
          price: parseFloat(maxPriceBid.price),
        };
      } else {
        order_args = {
          side: Side.SELL,
          tokenID: trade.asset,
          amount: parseFloat(maxPriceBid.size),
          price: parseFloat(maxPriceBid.price),
        };
      }
      console.log('Order args:', order_args);
      const signedOrder = await clobClient.createMarketOrder(order_args);
      const resp = await clobClient.postOrder(signedOrder, OrderType.FOK);
      if (resp.success === true) {
        console.log('Ordine SELL eseguito con successo:', resp);
        retry = 0;
        remaining -= order_args.amount;
      } else {
        retry += 1;
        console.log('Errore esecuzione ordine SELL, ritento...', resp);
      }
    }
    // Segnala completamento o fallimento al database e invia notifica Telegram
    if (retry >= RETRY_LIMIT) {
      await UserActivity.updateOne({ _id: trade._id }, { bot: true, botExcutedTime: retry });
      await sendTelegramMessage(`❌ Operazione *SELL* condizione ${trade.conditionId} fallita dopo ${retry} tentativi.`);
    } else {
      await UserActivity.updateOne({ _id: trade._id }, { bot: true });
      await sendTelegramMessage(`✅ Operazione *SELL* condizione ${trade.conditionId} completata con successo.`);
    }
  }
  // Altri casi (merge, etc.) rimangono inalterati...
};

export default postOrder;
