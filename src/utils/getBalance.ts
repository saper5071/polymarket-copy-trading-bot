import { ENV } from '../config/env';
import axios from 'axios';

export const getBalance = async (walletAddress: string): Promise<number> => {
  const provider = ENV.RPC_URL;
  const url = `${provider}/balance/${walletAddress}`;

  try {
    const response = await axios.get(url);
    const balance = parseFloat(response.data.usdc); // assicurati che l'API restituisca questo formato
    return balance;
  } catch (error) {
    console.error(`Errore nel recupero del bilancio di ${walletAddress}`, error);
    return 0;
  }
};
