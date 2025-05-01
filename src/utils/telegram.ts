import axios from 'axios';
import { ENV } from '../config/env';

export async function sendTelegramNotification(text: string) {
  const token = ENV.TELEGRAM_BOT_TOKEN;
  const chatId = ENV.TELEGRAM_CHAT_ID;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await axios.post(url, {
    chat_id: chatId,
    text: text,
    parse_mode: 'Markdown'
  });
}
