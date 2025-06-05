import { Injectable } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
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
  status: 'waiting' | 'ready' | 'countdown' | 'playing' | 'finished';
  countdown: number;
  gameTime: number;
  winner: string | null;
}
export interface ServerToClientEvents {
  'rooms:list': (rooms: Room[]) => void;
  'room:joined': (room: Room, player: Player) => void;
  'room:updated': (room: Room) => void;
  'room:countdown': (countdown: number) => void;
  'room:game-start': () => void;
  'room:game-end': (winner: string) => void;
  'player:click': (playerId: string, clicks: number) => void;
  error: (message: string) => void;
}

export interface ClientToServerEvents {
  'rooms:get': () => void;
  'room:create': (roomName: string, playerName: string) => void;
  'room:join': (roomId: string, playerName: string) => void;
  'room:leave': () => void;
  'player:ready': () => void;
  'player:click': () => void;
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
  ): [Room, Player] {
    const roomId = `room_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    const player: Player = {
      id: socket.id,
      name: playerName,
      clicks: 0,
      isReady: false,
    };

    const room: Room = {
      id: roomId,
      name: roomName,
      player1: player,
      player2: null,
      status: 'waiting',
      countdown: 10,
      gameTime: 30,
      winner: null,
    };

    this.ROOMS.set(roomId, room);
    this.SESSIONS.set(socket.id, { roomId, playerId: socket.id });
    return [room, player];
  }
  joinRoom(socket: Socket, roomId: string, playerName: string): [Room, Player] {
    const room = this.ROOMS.get(roomId);
    if (!room || room.player2 || room.status !== 'waiting') {
      throw new Error('Room not available');
    }

    const player: Player = {
      id: socket.id,
      name: playerName,
      clicks: 0,
      isReady: false,
    };

    room.player2 = player;
    room.status = 'ready';
    this.ROOMS.set(roomId, room);
    this.SESSIONS.set(socket.id, { roomId, playerId: socket.id });
    return [room, player];
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
      } else {
        this.ROOMS.delete(session.roomId);
      }
    } else if (room.player2?.id === socket.id) {
      room.player2 = null;
      room.status = 'waiting';
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
    if (!room) return;

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

        this.ROOMS.set(room.id, room);
        server.to(room.id).emit('room:game-end', room.winner);
        server.to(room.id).emit('room:updated', room);
      } else {
        server.to(room.id).emit('room:updated', room);
      }
    }, 1000);
  }
}
