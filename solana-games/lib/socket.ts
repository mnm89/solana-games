import { io, type Socket } from "socket.io-client";

export interface Player {
  id: string;
  name: string;
  walletAddress: string;
  clicks: number;
  isReady: boolean;
  betPaid: boolean;
  balance?: number;
}

export interface Room {
  id: string;
  name: string;
  betAmount: number; // in SOL
  player1: Player | null;
  player2: Player | null;
  status:
    | "waiting"
    | "bet_confirmation"
    | "ready"
    | "countdown"
    | "playing"
    | "finished"
    | "payout";
  countdown: number;
  gameTime: number;
  winner: string | null;
  totalPot: number;
  transactions: {
    player1Bet?: string;
    player2Bet?: string;
    winnerPayout?: string;
  };
}

export interface ServerToClientEvents {
  "rooms:list": (rooms: Room[]) => void;
  "room:joined": (room: Room, player: Player) => void;
  "room:updated": (room: Room) => void;
  "room:countdown": (countdown: number) => void;
  "room:game-start": () => void;
  "room:game-end": (winner: string) => void;
  "room:bet-required": (amount: number) => void;
  "room:bet-confirmed": (playerId: string) => void;
  "room:payout-ready": (winner: string, amount: number) => void;
  "player:click": (playerId: string, clicks: number) => void;
  error: (message: string) => void;
}

export interface ClientToServerEvents {
  "rooms:get": () => void;
  "room:create": (
    roomName: string,
    playerName: string,
    walletAddress: string,
    betAmount: number
  ) => void;
  "room:join": (
    roomId: string,
    playerName: string,
    walletAddress: string
  ) => void;
  "room:leave": () => void;
  "room:confirm-bet": (transactionSignature: string) => void;
  "player:ready": () => void;
  "player:click": () => void;
  "room:claim-winnings": () => void;
}

class SocketManager {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null =
    null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect(): Socket<ServerToClientEvents, ClientToServerEvents> {
    if (this.socket?.connected) {
      return this.socket;
    }

    const serverUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL || "ws://localhost:3001";

    this.socket = io(serverUrl, {
      transports: ["websocket"],
      autoConnect: true,
    });

    this.socket.on("connect", () => {
      console.log("Connected to server");
      this.reconnectAttempts = 0;
    });

    this.socket.on("disconnect", () => {
      console.log("Disconnected from server");
      this.handleReconnect();
    });

    this.socket.on("connect_error", (error) => {
      console.error("Connection error:", error);
      this.handleReconnect();
    });

    return this.socket;
  }

  private handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        console.log(`Reconnection attempt ${this.reconnectAttempts}`);
        this.socket?.connect();
      }, 2000 * this.reconnectAttempts);
    }
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }

  getSocket() {
    return this.socket;
  }
}

export const socketManager = new SocketManager();
