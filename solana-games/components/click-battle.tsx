"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Plus,
  Users,
  Clock,
  Trophy,
  ArrowLeft,
  Wifi,
  WifiOff,
} from "lucide-react";
import { socketManager, type Room, type Player } from "@/lib/socket";
import type { Socket } from "socket.io-client";

export default function Component() {
  const [currentScreen, setCurrentScreen] = useState<"lobby" | "room">("lobby");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [newRoomName, setNewRoomName] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [clickAnimations, setClickAnimations] = useState<number[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(10);
  const [opponentClickAnimations, setOpponentClickAnimations] = useState<
    number[]
  >([]);

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Initialize socket connection
    const socket = socketManager.connect("click-battle");
    socketRef.current = socket;

    // Connection status
    socket.on("connect", () => {
      setIsConnected(true);
      setConnectionError(null);
      socket.emit("rooms:get");
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("connect_error", () => {
      setIsConnected(false);
      setConnectionError("Failed to connect to server. Using demo mode.");
    });

    // Room events
    socket.on("rooms:list", (roomsList) => {
      setRooms(roomsList);
    });

    socket.on("room:joined", (room, player) => {
      setCurrentRoom(room);
      setCurrentPlayer(player);
      setCurrentScreen("room");
    });

    socket.on("room:updated", (room) => {
      setCurrentRoom(room);
    });

    socket.on("room:countdown", (countdownValue) => {
      setCountdown(countdownValue);
    });

    socket.on("room:game-start", () => {
      // Game started
    });

    socket.on("room:game-end", (winner) => {
      // Game ended
    });

    socket.on("player:click", (playerId, clicks) => {
      // Handle opponent clicks for animations
      if (currentPlayer && playerId !== currentPlayer.id) {
        // Add opponent click animation
        const animationId = Date.now();
        setOpponentClickAnimations((prev) => [...prev, animationId]);
        setTimeout(() => {
          setOpponentClickAnimations((prev) =>
            prev.filter((id) => id !== animationId)
          );
        }, 600);
      }
    });

    socket.on("error", (message) => {
      setConnectionError(message);
    });

    return () => {
      socketManager.disconnect();
    };
  }, []);

  const createRoom = () => {
    if (!newRoomName.trim() || !playerName.trim()) return;

    if (socketRef.current?.connected) {
      socketRef.current.emit("room:create", newRoomName, playerName);
      setNewRoomName("");
    } else {
      setConnectionError("Not connected to server");
    }
  };

  const joinRoom = (room: Room) => {
    if (!playerName.trim()) return;

    if (socketRef.current?.connected) {
      socketRef.current.emit("room:join", room.id, playerName);
    } else {
      setConnectionError("Not connected to server");
    }
  };

  const toggleReady = () => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("player:ready");
    }
  };

  const handleClick = () => {
    if (!currentRoom || currentRoom.status !== "playing") return;

    if (socketRef.current?.connected) {
      socketRef.current.emit("player:click");

      // Update local player score immediately for responsive UI
      setCurrentPlayer((prev) =>
        prev ? { ...prev, clicks: prev.clicks + 1 } : null
      );
    }

    // Add click animation
    const animationId = Date.now();
    setClickAnimations((prev) => [...prev, animationId]);
    setTimeout(() => {
      setClickAnimations((prev) => prev.filter((id) => id !== animationId));
    }, 600);
  };

  const leaveRoom = () => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("room:leave");
    }
    setCurrentScreen("lobby");
    setCurrentRoom(null);
    setCurrentPlayer(null);
    setClickAnimations([]);
  };

  const refreshRooms = () => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("rooms:get");
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getOpponent = (): Player | null => {
    if (!currentRoom || !currentPlayer) return null;
    return currentRoom.player1?.id === currentPlayer.id
      ? currentRoom.player2
      : currentRoom.player1;
  };

  const getLeadingPlayer = (): "player" | "opponent" | "tie" => {
    if (!currentPlayer || !currentRoom) return "tie";
    const opponent = getOpponent();
    if (!opponent) return "player";

    if (currentPlayer.clicks > opponent.clicks) return "player";
    if (opponent.clicks > currentPlayer.clicks) return "opponent";
    return "tie";
  };

  if (currentScreen === "lobby") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-4">
              Click Battle Arena
            </h1>
            <div className="flex items-center justify-center gap-2 mb-4">
              {isConnected ? (
                <Badge
                  variant="secondary"
                  className="bg-green-500/20 text-green-300"
                >
                  <Wifi className="w-4 h-4 mr-1" />
                  Connected
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className="bg-red-500/20 text-red-300"
                >
                  <WifiOff className="w-4 h-4 mr-1" />
                  Disconnected
                </Badge>
              )}
            </div>
            <p className="text-white/80">
              Join a room and battle other players in real-time!
            </p>
          </div>

          {/* Connection Error */}
          {connectionError && (
            <Alert className="mb-6 bg-red-500/20 border-red-500/30">
              <AlertDescription className="text-red-300">
                {connectionError}
              </AlertDescription>
            </Alert>
          )}

          {/* Create Room Section */}
          <Card className="bg-white/10 border-white/20 p-6 mb-6">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center">
              <Plus className="w-5 h-5 mr-2" />
              Create New Battle
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                placeholder="Your name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/60"
              />
              <Input
                placeholder="Room name"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/60"
              />
              <Button
                onClick={createRoom}
                className="bg-green-600 hover:bg-green-700"
                disabled={
                  !newRoomName.trim() || !playerName.trim() || !isConnected
                }
              >
                Create Room
              </Button>
            </div>
          </Card>

          {/* Available Rooms */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white flex items-center">
                <Users className="w-6 h-6 mr-2" />
                Available Rooms ({rooms.length})
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={refreshRooms}
                disabled={!isConnected}
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              >
                Refresh
              </Button>
            </div>

            {rooms.length === 0 ? (
              <Card className="bg-white/10 border-white/20 p-8 text-center">
                <p className="text-white/60">
                  {isConnected
                    ? "No rooms available. Create one to start battling!"
                    : "Connect to server to see available rooms"}
                </p>
              </Card>
            ) : (
              <div className="grid gap-4">
                {rooms.map((room) => (
                  <Card
                    key={room.id}
                    className="bg-white/10 border-white/20 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-white">
                          {room.name}
                        </h3>
                        <p className="text-white/60">
                          Host: {room.player1?.name} • Waiting for opponent
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge
                          variant="secondary"
                          className="bg-yellow-500/20 text-yellow-300"
                        >
                          <Clock className="w-4 h-4 mr-1" />
                          Waiting
                        </Badge>
                        <Button
                          onClick={() => joinRoom(room)}
                          disabled={!playerName.trim() || !isConnected}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          Join Battle
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Player Name Input for Joining */}
          {!playerName && (
            <Card className="bg-red-500/20 border-red-500/30 p-4 mt-6">
              <p className="text-red-300 text-center">
                Enter your name above to create or join a room!
              </p>
            </Card>
          )}
        </div>
      </div>
    );
  }

  // Room Screen
  const opponent = getOpponent();

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="outline"
            onClick={leaveRoom}
            className="bg-white/10 border-white/20 text-white hover:bg-white/20"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Leave Room
          </Button>

          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">
              {currentRoom?.name}
            </h1>
            {currentRoom?.status === "playing" && (
              <div className="text-xl font-bold text-yellow-300">
                {formatTime(currentRoom.gameTime)}
              </div>
            )}
            <div className="flex items-center justify-center gap-2 mt-1">
              {isConnected ? (
                <Badge
                  variant="secondary"
                  className="bg-green-500/20 text-green-300 text-xs"
                >
                  <Wifi className="w-3 h-3 mr-1" />
                  Live
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className="bg-red-500/20 text-red-300 text-xs"
                >
                  <WifiOff className="w-3 h-3 mr-1" />
                  Offline
                </Badge>
              )}
            </div>
          </div>

          {/* Opponent Score */}
          <Card
            className={`bg-white/10 border-white/20 p-3 min-w-[120px] ${
              getLeadingPlayer() === "opponent"
                ? "ring-4 ring-yellow-400 animate-pulse"
                : ""
            }`}
          >
            <div className="text-center text-white relative">
              {/* Opponent Click Animations */}
              {opponentClickAnimations.map((id) => (
                <div
                  key={id}
                  className="absolute text-2xl font-bold animate-ping text-yellow-300"
                  style={{
                    left: `${Math.random() * 80 + 10}%`,
                    top: `${Math.random() * 80 + 10}%`,
                  }}
                >
                  +1
                </div>
              ))}
              <div className="text-sm opacity-80">
                {opponent?.name || "Waiting..."}
              </div>
              <div className="text-2xl font-bold">{opponent?.clicks || 0}</div>
              {currentRoom?.status === "playing" &&
                getLeadingPlayer() === "opponent" && (
                  <div className="text-xs text-yellow-300 font-bold animate-pulse">
                    LEADING!
                  </div>
                )}
            </div>
          </Card>
        </div>

        {/* Game Status */}
        {currentRoom?.status === "waiting" && (
          <Card className="bg-yellow-500/20 border-yellow-500/30 p-6 mb-6 text-center">
            <h2 className="text-xl font-bold text-yellow-300 mb-2">
              Waiting for opponent...
            </h2>
            <p className="text-white/80">
              Share this room with a friend to start the battle!
            </p>
          </Card>
        )}

        {currentRoom?.status === "ready" && (
          <Card className="bg-blue-500/20 border-blue-500/30 p-6 mb-6 text-center">
            <h2 className="text-xl font-bold text-blue-300 mb-4">
              Ready to Battle!
            </h2>
            <Button
              onClick={toggleReady}
              size="lg"
              disabled={!isConnected}
              className={`${
                currentPlayer?.isReady
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-red-600 hover:bg-red-700"
              }`}
            >
              {currentPlayer?.isReady ? "Ready! ✓" : "Click when Ready"}
            </Button>
            <div className="mt-4 text-white/80">
              {currentRoom.player1?.isReady && currentRoom.player2?.isReady
                ? "Both players ready! Starting countdown..."
                : `${
                    currentRoom.player1?.isReady ? currentRoom.player1.name : ""
                  } ${
                    currentRoom.player2?.isReady ? currentRoom.player2.name : ""
                  } ${
                    (currentRoom.player1?.isReady ? 1 : 0) +
                      (currentRoom.player2?.isReady ? 1 : 0) ===
                    1
                      ? "is ready"
                      : ""
                  }`}
            </div>
          </Card>
        )}

        {currentRoom?.status === "countdown" && (
          <Card className="bg-red-500/20 border-red-500/30 p-8 mb-6 text-center">
            <div className="text-6xl font-bold text-red-300 animate-pulse mb-2">
              {countdown}
            </div>
            <p className="text-white text-xl">Get ready to click!</p>
          </Card>
        )}

        {currentRoom?.status === "finished" && (
          <Card className="bg-yellow-500/20 border-yellow-500/30 p-6 mb-6 text-center">
            <Trophy className="w-12 h-12 mx-auto text-yellow-400 mb-4" />
            <h2 className="text-2xl font-bold text-yellow-300 mb-2">
              {currentRoom.winner === "Tie"
                ? "It's a Tie!"
                : `${currentRoom.winner} Wins!`}
            </h2>
            <p className="text-white/80">
              Final Score: {currentRoom.player1?.name}{" "}
              {currentRoom.player1?.clicks} - {currentRoom.player2?.clicks}{" "}
              {currentRoom.player2?.name}
            </p>
          </Card>
        )}

        {/* Click Area */}
        {currentRoom &&
          (currentRoom.status === "playing" ||
            currentRoom.status === "finished") && (
            <Card
              className={`relative overflow-hidden h-96 cursor-pointer transition-all duration-200 ${
                currentRoom.status === "playing" && isConnected
                  ? `bg-gradient-to-br ${
                      getLeadingPlayer() === "player"
                        ? "from-green-600 to-green-800 ring-4 ring-yellow-400"
                        : "from-green-600 to-green-800"
                    } hover:scale-[1.02] active:scale-95`
                  : "bg-gradient-to-br from-gray-600 to-gray-800"
              }`}
              onClick={handleClick}
            >
              <div className="h-full flex flex-col items-center justify-center text-white p-8 relative">
                {/* Click Animations */}
                {clickAnimations.map((id) => (
                  <div
                    key={id}
                    className="absolute text-6xl font-bold animate-ping text-yellow-300"
                    style={{
                      left: `${Math.random() * 80 + 10}%`,
                      top: `${Math.random() * 80 + 10}%`,
                    }}
                  >
                    +1
                  </div>
                ))}

                <div className="text-center">
                  <h2 className="text-2xl font-bold mb-4">
                    {currentPlayer?.name}
                  </h2>
                  <div className="text-8xl font-bold mb-4 animate-pulse">
                    {currentPlayer?.clicks || 0}
                  </div>
                  <Badge variant="secondary" className="text-lg px-4 py-2">
                    {currentRoom.status === "playing" && isConnected
                      ? "Click Here!"
                      : currentRoom.status === "finished"
                      ? "Game Over"
                      : "Waiting..."}
                  </Badge>

                  {/* Leading indicator */}
                  {currentRoom.status === "playing" &&
                    getLeadingPlayer() === "player" && (
                      <div className="mt-4 text-yellow-300 font-bold text-xl animate-bounce">
                        🔥 LEADING! 🔥
                      </div>
                    )}
                </div>
              </div>
            </Card>
          )}

        {/* Waiting State */}
        {currentRoom && !opponent && currentRoom.status === "waiting" && (
          <Card className="bg-white/10 border-white/20 p-12 text-center">
            <Users className="w-16 h-16 mx-auto text-white/60 mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">
              Waiting for opponent...
            </h3>
            <p className="text-white/60">
              Share this room to invite someone to battle!
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
