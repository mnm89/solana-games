import { io, type Socket } from "socket.io-client";

export interface Player {
  id: string;
  name: string;
  clicks: number;
  isReady: boolean;
}

export interface Room {
  id: string;
  name: string;
  player1: Player | null;
  player2: Player | null;
  status: "waiting" | "ready" | "countdown" | "playing" | "finished";
  countdown: number;
  gameTime: number;
  winner: string | null;
}

export interface ServerToClientEvents {
  "rooms:list": (rooms: Room[]) => void;
  "room:joined": (room: Room, player: Player) => void;
  "room:updated": (room: Room) => void;
  "room:countdown": (countdown: number) => void;
  "room:game-start": () => void;
  "room:game-end": (winner: string) => void;
  "player:click": (playerId: string, clicks: number) => void;
  error: (message: string) => void;
}

export interface ClientToServerEvents {
  "rooms:get": () => void;
  "room:create": (roomName: string, playerName: string) => void;
  "room:join": (roomId: string, playerName: string) => void;
  "room:leave": () => void;
  "player:ready": () => void;
  "player:click": () => void;
}
type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

class SocketManager {
  private sockets: Map<string, TypedSocket> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private maxReconnectAttempts = 5;

  connect(namespace = ""): TypedSocket {
    const ns = namespace.startsWith("/") ? namespace : `/${namespace}`;

    if (this.sockets.has(ns) && this.sockets.get(ns)!.connected) {
      return this.sockets.get(ns)!;
    }

    const serverUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL || "ws://localhost:3001";

    const socket = io(`${serverUrl}${ns}`, {
      transports: ["websocket"],
      autoConnect: true,
    });

    socket.on("connect", () => {
      console.log(`Connected to ${ns || "/"}`);
      this.reconnectAttempts.set(ns, 0);
    });

    socket.on("disconnect", () => {
      console.log(`Disconnected from ${ns || "/"}`);
      this.handleReconnect(ns);
    });

    socket.on("connect_error", (error) => {
      console.error(`Connection error on ${ns || "/"}`, error);
      this.handleReconnect(ns);
    });

    this.sockets.set(ns, socket);
    return socket;
  }

  private handleReconnect(namespace: string) {
    const attempts = this.reconnectAttempts.get(namespace) || 0;
    if (attempts < this.maxReconnectAttempts) {
      const nextAttempts = attempts + 1;
      this.reconnectAttempts.set(namespace, nextAttempts);
      setTimeout(() => {
        console.log(`Reconnection attempt ${nextAttempts} to ${namespace}`);
        this.sockets.get(namespace)?.connect();
      }, 2000 * nextAttempts);
    }
  }

  disconnect(namespace = "") {
    const ns = namespace.startsWith("/") ? namespace : `/${namespace}`;
    this.sockets.get(ns)?.disconnect();
    this.sockets.delete(ns);
    this.reconnectAttempts.delete(ns);
  }

  getSocket(namespace = ""): TypedSocket | undefined {
    const ns = namespace.startsWith("/") ? namespace : `/${namespace}`;
    return this.sockets.get(ns);
  }
}

export const socketManager = new SocketManager();
