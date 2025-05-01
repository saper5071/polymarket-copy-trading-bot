import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { UserActivityInterface } from '../interfaces/User';
import { getUserActivityModel } from '../models/userHistory';
import { ENV } from '../config/env';
import axios from 'axios';
import Spinner from './spinner';

export default async function postOrder(
  clobClient: ClobClient,
  action: 'buy' | 'sell' | 'merge',
  myPos: any,
  userPos: any,
  trade: UserActivityInterface,
  myBalance: number,
  userBalance: number
) {
  let orderArgs: any;
  let side: Side;

  if (action === 'buy' || action === 'merge') {
    side = Side.BUY;
    orderArgs = {
      side: Side.BUY,
      tokenID: userPos?.asset,
      size: trade.size,
      price: trade.price,
      feeRateBps: '0'
    };
  } else {
    side = Side.SELL;
    orderArgs = {
      side: Side.SELL,
      tokenID: myPos?.asset,
      size: trade.size,
      price: trade.price,
      feeRateBps: '0'
    };
  }

  try {
    const signedOrder = await clobClient.createOrder(orderArgs);
    const resp = await clobClient.postOrder(signedOrder, OrderType.GTC);

    if (resp.success) {
      console.log('Trade copiato con successo:', resp);
      const sideText = side === Side.BUY ? 'ACQUISTO' : 'VENDITA';
      const marketLink = `https://polymarket.com/market/${trade.conditionId}`;
      const message = 
        `*Mercato:* ${trade.title?.slice(0, 30)}...\n` + // <-- Modifica: 'title' al posto di 'question'
        `*Tipo:* ${sideText}\n` +
        `*Importo:* ${ (trade.size * trade.price).toFixed(2) } USD\n` +
        `[🔗 Apri Mercato](${marketLink})`;

      await sendTelegramNotification(message);

      const userActivityModel = getUserActivityModel(trade.proxyWallet); // <-- Passaggio corretto
      await userActivityModel.updateOne(
        { _id: trade._id },
        { bot: true, botExcutedTime: trade.botExcutedTime + 1 }
      );
    } else {
      console.error('Ordine fallito, ritentando:', resp);

      const userActivityModel = getUserActivityModel(trade.proxyWallet); // <-- Passaggio corretto
      await userActivityModel.updateOne(
        { _id: trade._id },
        { botExcutedTime: trade.botExcutedTime + 1 }
      );
    }
  } catch (error) {
    console.error('Errore durante la creazione dell\'ordine:', error);
  }
}

async function sendTelegramNotification(text: string) {
  const token = ENV.TELEGRAM_BOT_TOKEN;
  const chatId = ENV.TELEGRAM_CHAT_ID;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    await axios.post(url, {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    });
    console.log('Notifica Telegram inviata.');
  } catch (err) {
    console.error('Errore invio Telegram:', err);
  }
}
