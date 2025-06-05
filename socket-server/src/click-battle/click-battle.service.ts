import { Injectable } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
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
    | 'waiting'
    | 'bet_confirmation'
    | 'ready'
    | 'countdown'
    | 'playing'
    | 'finished'
    | 'payout';
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
  'rooms:list': (rooms: Room[]) => void;
  'room:joined': (room: Room, player: Player) => void;
  'room:updated': (room: Room) => void;
  'room:countdown': (countdown: number) => void;
  'room:game-start': () => void;
  'room:game-end': (winner: string) => void;
  'room:bet-required': (amount: number) => void;
  'room:bet-confirmed': (playerId: string) => void;
  'room:payout-ready': (winner: string, amount: number) => void;
  'player:click': (playerId: string, clicks: number) => void;
  error: (message: string) => void;
}

export interface ClientToServerEvents {
  'rooms:get': () => void;
  'room:create': (
    roomName: string,
    playerName: string,
    walletAddress: string,
    betAmount: number,
  ) => void;
  'room:join': (
    roomId: string,
    playerName: string,
    walletAddress: string,
  ) => void;
  'room:leave': () => void;
  'room:confirm-bet': (transactionSignature: string) => void;
  'player:ready': () => void;
  'player:click': () => void;
  'room:claim-winnings': () => void;
}

@Injectable()
export class ClickBattleService {
  private readonly ROOMS = new Map<string, Room>();
  private readonly SESSIONS = new Map<
    string,
    { roomId: string | null; playerId: string }
  >();

  addSession(socket: Socket) {
    this.SESSIONS.set(socket.id, { roomId: null, playerId: socket.id });
  }
  deleteSession(socket: Socket) {
    const session = this.SESSIONS.get(socket.id);
    if (session?.roomId) {
      // Trigger leave room logic
      socket.emit('room:leave');
    }
    this.SESSIONS.delete(socket.id);
  }
  getRooms() {
    return Array.from(this.ROOMS.values()).filter(
      (room) => room.status === 'waiting',
    );
  }

  createRoom(
    socket: Socket,
    roomName: string,
    playerName: string,
    walletAddress: string,
    betAmount: number,
  ): [Room, Player] {
    const roomId = `room_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    const player: Player = {
      id: socket.id,
      name: playerName,
      clicks: 0,
      isReady: false,
      walletAddress,
      betPaid: false,
    };

    const room: Room = {
      id: roomId,
      name: roomName,
      betAmount,
      player1: player,
      player2: null,
      status: 'waiting',
      countdown: 10,
      gameTime: 30,
      winner: null,
      totalPot: 0,
      transactions: {},
    };

    this.ROOMS.set(roomId, room);
    this.SESSIONS.set(socket.id, { roomId, playerId: socket.id });
    return [room, player];
  }
  joinRoom(
    socket: Socket,
    roomId: string,
    playerName: string,
    walletAddress: string,
  ): [Room, Player] {
    const room = this.ROOMS.get(roomId);
    if (!room || room.player2 || room.status !== 'waiting') {
      throw new Error('Room not available');
    }

    const player: Player = {
      id: socket.id,
      name: playerName,
      clicks: 0,
      isReady: false,
      walletAddress,
      betPaid: false,
    };

    room.player2 = player;
    room.status = 'bet_confirmation';
    this.ROOMS.set(roomId, room);
    this.SESSIONS.set(socket.id, { roomId, playerId: socket.id });
    return [room, player];
  }
  confirmBet(socket: Socket, transactionSignature: string): Room | undefined {
    const session = this.SESSIONS.get(socket.id);
    if (!session?.roomId) return;

    const room = this.ROOMS.get(session.roomId);
    if (!room) return;

    // Update player bet status
    if (room.player1?.id === socket.id) {
      room.player1.betPaid = true;
      room.transactions.player1Bet = transactionSignature;
    } else if (room.player2?.id === socket.id) {
      room.player2.betPaid = true;
      room.transactions.player2Bet = transactionSignature;
    }
    // Check if both players have paid
    if (room.player1?.betPaid && room.player2?.betPaid) {
      room.status = 'ready';
    }

    this.ROOMS.set(session.roomId, room);
    return room;
  }
  async leaveRoom(socket: Socket, server: Server) {
    const session = this.SESSIONS.get(socket.id);
    if (!session?.roomId) return;

    const room = this.ROOMS.get(session.roomId);
    if (!room) return;
    // Remove player from room
    if (room.player1?.id === socket.id) {
      if (room.player2) {
        room.player1 = room.player2;
        room.player2 = null;
        room.status = 'waiting';
        room.totalPot = 0;
        // Reset bet status
        room.player1.betPaid = false;
        room.player1.isReady = false;
      } else {
        this.ROOMS.delete(session.roomId);
      }
    } else if (room.player2?.id === socket.id) {
      room.player2 = null;
      room.status = 'waiting';
      room.totalPot = 0;
      // Reset bet status
      if (room.player1) {
        room.player1.betPaid = false;
        room.player1.isReady = false;
      }
    }
    await socket.leave(session.roomId);
    this.SESSIONS.set(socket.id, { roomId: null, playerId: socket.id });

    if (this.ROOMS.has(session.roomId)) {
      this.ROOMS.set(session.roomId, room);
      server.to(session.roomId).emit('room:updated', room);
      // Add back to waiting rooms if needed
      if (room.status === 'waiting') {
        server.emit(
          'rooms:list',
          Array.from(this.ROOMS.values()).filter((r) => r.status === 'waiting'),
        );
      }
    } else {
      // Room deleted, update rooms list
      server.emit(
        'rooms:list',
        Array.from(this.ROOMS.values()).filter((r) => r.status === 'waiting'),
      );
    }
  }
  playerReady(socket: Socket, server: Server): Room | undefined {
    const session = this.SESSIONS.get(socket.id);
    if (!session?.roomId) return;

    const room = this.ROOMS.get(session.roomId);
    if (!room || room.status !== 'ready') return;

    // Update player ready status
    if (room.player1?.id === socket.id) {
      room.player1.isReady = !room.player1.isReady;
    } else if (room.player2?.id === socket.id) {
      room.player2.isReady = !room.player2.isReady;
    }

    // Check if both players are ready
    if (room.player1?.isReady && room.player2?.isReady) {
      room.status = 'countdown';
      this.startCountdown(room, server);
    }

    this.ROOMS.set(session.roomId, room);
    return room;
  }
  playerClick(socket: Socket, server: Server): Room | undefined {
    const session = this.SESSIONS.get(socket.id);
    if (!session?.roomId) return;

    const room = this.ROOMS.get(session.roomId);
    if (!room || room.status !== 'playing') return;

    // Update player clicks
    if (room.player1?.id === socket.id) {
      room.player1.clicks++;
      server
        .to(session.roomId)
        .emit('player:click', socket.id, room.player1.clicks);
    } else if (room.player2?.id === socket.id) {
      room.player2.clicks++;
      server
        .to(session.roomId)
        .emit('player:click', socket.id, room.player2.clicks);
    }

    this.ROOMS.set(session.roomId, room);
    server.to(session.roomId).emit('room:updated', room);
  }

  claimWinnings(socket: Socket, server: Server) {
    const session = this.SESSIONS.get(socket.id);
    if (!session?.roomId) return;

    const room = this.ROOMS.get(session.roomId);
    if (!room || room.status !== 'payout') return;

    // Verify the claimer is the winner
    const claimer =
      room.player1?.id === socket.id ? room.player1 : room.player2;
    if (!claimer || room.winner !== claimer.name) {
      socket.emit('error', 'You are not the winner');
      return;
    }

    // In a real implementation, you would:
    // 1. Create a transaction to send winnings from program wallet to winner
    // 2. Sign and send the transaction
    // 3. Confirm the transaction
    // 4. Update room status

    // For now, we'll simulate the payout
    console.log(
      `Processing payout for ${claimer.name}: ${room.totalPot * 0.95} SOL`,
    );

    // Mark room as completed
    room.status = 'finished';
    this.ROOMS.set(session.roomId, room);
    server.to(session.roomId).emit('room:updated', room);

    // Clean up room after some time
    setTimeout(() => {
      this.ROOMS.delete(session.roomId!);
    }, 30000); // 30 seconds
  }

  private startCountdown(room: Room, server: Server) {
    const countdownInterval = setInterval(() => {
      room.countdown--;
      server.to(room.id).emit('room:countdown', room.countdown);

      if (room.countdown <= 0) {
        clearInterval(countdownInterval);
        room.status = 'playing';
        room.gameTime = 30;

        server.to(room.id).emit('room:game-start');
        server.to(room.id).emit('room:updated', room);
        this.startGameTimer(room, server);
      }
    }, 1000);
  }
  private startGameTimer(room: Room, server: Server) {
    const gameInterval = setInterval(() => {
      room.gameTime--;

      if (room.gameTime <= 0) {
        clearInterval(gameInterval);
        room.status = 'finished';

        // Determine winner
        if (!room.player1 || !room.player2) {
          room.winner = 'No winner';
        } else if (room.player1.clicks > room.player2.clicks) {
          room.winner = room.player1.name;
        } else if (room.player2.clicks > room.player1.clicks) {
          room.winner = room.player2.name;
        } else {
          room.winner = 'Tie';
        }
        // If there's a winner (not a tie), prepare for payout
        if (room.winner !== 'Tie' && room.winner !== 'No winner') {
          room.status = 'payout';
          const winnerAmount = room.totalPot * 0.95; // 95% after 5% fee
          server
            .to(room.id)
            .emit('room:payout-ready', room.winner, winnerAmount);
        }

        this.ROOMS.set(room.id, room);
        server.to(room.id).emit('room:game-end', room.winner);
        server.to(room.id).emit('room:updated', room);
      } else {
        server.to(room.id).emit('room:updated', room);
      }
    }, 1000);
  }
}
