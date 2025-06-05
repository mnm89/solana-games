import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { cors } from '../constants';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ClickBattleService } from './click-battle.service';

@WebSocketGateway({
  cors,
  namespace: 'click-battle',
})
export class ClickBattleGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server: Server;

  private readonly logger = new Logger(ClickBattleGateway.name);

  constructor(private service: ClickBattleService) {}

  handleConnection(socket: Socket) {
    this.logger.verbose('HANDLE USER CONNECTION - ' + socket.id);
    // Initialize player session
    this.service.addSession(socket);
  }
  handleDisconnect(socket: Socket) {
    this.logger.verbose('HANDLE USER DISCONNECT - ' + socket.id);
    this.service.deleteSession(socket);
  }

  @SubscribeMessage('rooms:get')
  handleGetRooms(socket: Socket) {
    socket.emit('rooms:list', this.service.getRooms());
  }
  @SubscribeMessage('room:create')
  async handleCreateRoom(socket: Socket, data: [string, string]) {
    const [room, player] = this.service.createRoom(socket, ...data);
    await socket.join(room.id);
    socket.emit('room:joined', room, player);

    // Broadcast updated rooms list
    this.server.emit('rooms:list', this.service.getRooms());
  }
  @SubscribeMessage('room:join')
  async handleJoinRoom(socket: Socket, data: [string, string]) {
    try {
      const [room, player] = this.service.joinRoom(socket, ...data);
      await socket.join(room.id);
      socket.emit('room:joined', room, player);

      this.server.to(room.id).emit('room:updated', room);
      // Broadcast updated rooms list
      this.server.emit('rooms:list', this.service.getRooms());
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      socket.emit('error', error.message);
    }
  }
  @SubscribeMessage('player:ready')
  handlePlayerReady(socket: Socket) {
    const room = this.service.playerReady(socket, this.server);
    if (room) {
      this.server.to(room.id).emit('room:updated', room);
    }
  }
  @SubscribeMessage('player:click')
  handlePlayerClick(socket: Socket) {
    const room = this.service.playerClick(socket, this.server);
    if (room) {
      this.server.to(room.id).emit('room:updated', room);
    }
  }

  @SubscribeMessage('room:leave')
  async handleRoomLeave(socket: Socket) {
    await this.service.leaveRoom(socket, this.server);
  }
}
