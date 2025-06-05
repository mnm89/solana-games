import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

export const SOLANA_NETWORK =
  process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
export const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";

// Program wallet (house wallet) - in production, this should be a program-derived address
export const PROGRAM_WALLET = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_WALLET || "11111111111111111111111111111111"
);

export const connection = new Connection(RPC_ENDPOINT, "confirmed");

export const GAME_FEE_PERCENTAGE = 5; // 5% fee

export interface BetTransaction {
  signature: string;
  amount: number;
  player: string;
  timestamp: number;
}

export class SolanaService {
  static async getBalance(publicKey: PublicKey): Promise<number> {
    try {
      const balance = await connection.getBalance(publicKey);
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      console.error("Error getting balance:", error);
      return 0;
    }
  }

  static async createBetTransaction(
    fromPubkey: PublicKey,
    toPubkey: PublicKey,
    amount: number
  ): Promise<Transaction> {
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports: amount * LAMPORTS_PER_SOL,
      })
    );

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = fromPubkey;

    return transaction;
  }

  static async createWinnerPayoutTransaction(
    fromPubkey: PublicKey,
    toPubkey: PublicKey,
    totalAmount: number
  ): Promise<Transaction> {
    const feeAmount = (totalAmount * GAME_FEE_PERCENTAGE) / 100;
    const winnerAmount = totalAmount - feeAmount;

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports: winnerAmount * LAMPORTS_PER_SOL,
      })
    );

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = fromPubkey;

    return transaction;
  }

  static formatSolAmount(lamports: number): string {
    return (lamports / LAMPORTS_PER_SOL).toFixed(4);
  }

  static async confirmTransaction(signature: string): Promise<boolean> {
    try {
      const confirmation = await connection.confirmTransaction(
        signature,
        "confirmed"
      );
      return !confirmation.value.err;
    } catch (error) {
      console.error("Error confirming transaction:", error);
      return false;
    }
  }
}
