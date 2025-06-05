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
  Wallet,
  DollarSign,
} from "lucide-react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { socketManager, type Room, type Player } from "@/lib/socket";
import {
  SolanaService,
  PROGRAM_WALLET,
  GAME_FEE_PERCENTAGE,
} from "@/lib/solana";
import type { Socket } from "socket.io-client";

export default function Component() {
  const { publicKey, signTransaction, connected } = useWallet();
  const { connection } = useConnection();
  const [currentScreen, setCurrentScreen] = useState<"lobby" | "room">("lobby");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [newRoomName, setNewRoomName] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [betAmount, setBetAmount] = useState<string>("0.1");
  const [clickAnimations, setClickAnimations] = useState<number[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(10);
  const [opponentClickAnimations, setOpponentClickAnimations] = useState<
    number[]
  >([]);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [isProcessingBet, setIsProcessingBet] = useState(false);
  const [isClaimingWinnings, setIsClaimingWinnings] = useState(false);

  const socketRef = useRef<Socket | null>(null);

  // Update wallet balance
  useEffect(() => {
    if (publicKey && connected) {
      SolanaService.getBalance(publicKey).then(setWalletBalance);
    }
  }, [publicKey, connected]);

  useEffect(() => {
    const socket = socketManager.connect();
    socketRef.current = socket;

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
      setConnectionError("Failed to connect to server.");
    });

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

    socket.on("room:bet-required", async (amount) => {
      if (!publicKey || !signTransaction) return;
      await handleBetPayment(amount);
    });

    socket.on("room:bet-confirmed", (playerId) => {
      console.log(`Bet confirmed for player ${playerId}`);
      setIsProcessingBet(false);
    });

    socket.on("room:countdown", (countdownValue) => {
      setCountdown(countdownValue);
    });

    socket.on("room:payout-ready", (winner, amount) => {
      console.log(`Payout ready: ${winner} wins ${amount} SOL`);
    });

    socket.on("player:click", (playerId, clicks) => {
      if (currentPlayer && playerId !== currentPlayer.id) {
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
      setIsProcessingBet(false);
      setIsClaimingWinnings(false);
    });

    return () => {
      socketManager.disconnect();
    };
  }, [currentPlayer]);

  const handleBetPayment = async (amount: number) => {
    if (!publicKey || !signTransaction || !socketRef.current || !connection)
      return;

    setIsProcessingBet(true);
    try {
      const transaction = await SolanaService.createBetTransaction(
        publicKey,
        PROGRAM_WALLET,
        amount
      );
      const signedTransaction = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(
        signedTransaction.serialize()
      );

      // Confirm transaction
      const confirmed = await SolanaService.confirmTransaction(signature);
      if (confirmed) {
        socketRef.current.emit("room:confirm-bet", signature);
        // Update balance
        const newBalance = await SolanaService.getBalance(publicKey);
        setWalletBalance(newBalance);
      } else {
        throw new Error("Transaction failed to confirm");
      }
    } catch (error) {
      console.error("Bet payment failed:", error);
      setConnectionError("Failed to process bet payment");
      setIsProcessingBet(false);
    }
  };

  const createRoom = () => {
    if (!newRoomName.trim() || !playerName.trim() || !publicKey || !connected)
      return;

    const betAmountNum = Number.parseFloat(betAmount);
    if (isNaN(betAmountNum) || betAmountNum <= 0) {
      setConnectionError("Please enter a valid bet amount");
      return;
    }

    if (betAmountNum > walletBalance) {
      setConnectionError("Insufficient balance for bet");
      return;
    }

    if (socketRef.current?.connected) {
      socketRef.current.emit(
        "room:create",
        newRoomName,
        playerName,
        publicKey.toString(),
        betAmountNum
      );
      setNewRoomName("");
    }
  };

  const joinRoom = (room: Room) => {
    if (!playerName.trim() || !publicKey || !connected) return;

    if (room.betAmount > walletBalance) {
      setConnectionError("Insufficient balance to join this room");
      return;
    }

    if (socketRef.current?.connected) {
      socketRef.current.emit(
        "room:join",
        room.id,
        playerName,
        publicKey.toString()
      );
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
      setCurrentPlayer((prev) =>
        prev ? { ...prev, clicks: prev.clicks + 1 } : null
      );
    }

    const animationId = Date.now();
    setClickAnimations((prev) => [...prev, animationId]);
    setTimeout(() => {
      setClickAnimations((prev) => prev.filter((id) => id !== animationId));
    }, 600);
  };

  const claimWinnings = async () => {
    if (
      !currentRoom ||
      !publicKey ||
      !signTransaction ||
      currentRoom.status !== "payout"
    )
      return;

    setIsClaimingWinnings(true);
    try {
      if (socketRef.current?.connected) {
        socketRef.current.emit("room:claim-winnings");
      }
      // Update balance after claiming
      setTimeout(async () => {
        const newBalance = await SolanaService.getBalance(publicKey);
        setWalletBalance(newBalance);
      }, 3000);
    } catch (error) {
      console.error("Failed to claim winnings:", error);
      setIsClaimingWinnings(false);
    }
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
            <p className="text-white/80 mb-4">Compete for real SOL rewards!</p>

            {/* Wallet Connection */}
            <div className="flex items-center justify-center gap-4 mb-4">
              <WalletMultiButton />
              {connected && publicKey && (
                <Card className="bg-white/10 border-white/20 p-3">
                  <div className="flex items-center gap-2 text-white">
                    <Wallet className="w-4 h-4" />
                    <span className="text-sm">
                      {walletBalance.toFixed(4)} SOL
                    </span>
                  </div>
                </Card>
              )}
            </div>

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
          </div>

          {!connected && (
            <Alert className="mb-6 bg-yellow-500/20 border-yellow-500/30">
              <AlertDescription className="text-yellow-300">
                Connect your Solana wallet to create or join betting rooms!
              </AlertDescription>
            </Alert>
          )}

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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              <div className="relative">
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="Bet amount"
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/60 pr-12"
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/60 text-sm">
                  SOL
                </span>
              </div>
              <Button
                onClick={createRoom}
                className="bg-green-600 hover:bg-green-700"
                disabled={
                  !connected ||
                  !newRoomName.trim() ||
                  !playerName.trim() ||
                  !isConnected
                }
              >
                Create Room
              </Button>
            </div>
            {connected && (
              <p className="text-white/60 text-sm mt-2">
                Game fee: {GAME_FEE_PERCENTAGE}% • Winner takes{" "}
                {100 - GAME_FEE_PERCENTAGE}% of total pot
              </p>
            )}
          </Card>

          {/* Available Rooms */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-white flex items-center">
              <Users className="w-6 h-6 mr-2" />
              Available Rooms ({rooms.length})
            </h2>

            {rooms.length === 0 ? (
              <Card className="bg-white/10 border-white/20 p-8 text-center">
                <p className="text-white/60">
                  No rooms available. Create one to start battling!
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
                          Host: {room.player1?.name}
                        </p>
                        <div className="flex items-center gap-4 mt-2">
                          <Badge
                            variant="secondary"
                            className="bg-green-500/20 text-green-300"
                          >
                            <DollarSign className="w-3 h-3 mr-1" />
                            {room.betAmount} SOL
                          </Badge>
                          <Badge
                            variant="secondary"
                            className="bg-yellow-500/20 text-yellow-300"
                          >
                            <Trophy className="w-3 h-3 mr-1" />
                            Winner gets{" "}
                            {(room.betAmount *
                              2 *
                              (100 - GAME_FEE_PERCENTAGE)) /
                              100}{" "}
                            SOL
                          </Badge>
                        </div>
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
                          disabled={
                            !connected || !playerName.trim() || !isConnected
                          }
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
            <div className="flex items-center justify-center gap-4 mt-1">
              <Badge
                variant="secondary"
                className="bg-green-500/20 text-green-300"
              >
                <DollarSign className="w-3 h-3 mr-1" />
                Pot:{" "}
                {currentRoom?.totalPot ||
                  (currentRoom?.betAmount ? currentRoom.betAmount * 2 : 0)}{" "}
                SOL
              </Badge>
              {currentRoom?.status === "playing" && (
                <div className="text-xl font-bold text-yellow-300">
                  {formatTime(currentRoom.gameTime)}
                </div>
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

        {/* Bet Confirmation Status */}
        {currentRoom?.status === "bet_confirmation" && (
          <Card className="bg-orange-500/20 border-orange-500/30 p-6 mb-6 text-center">
            <h2 className="text-xl font-bold text-orange-300 mb-4">
              Bet Confirmation Required
            </h2>
            <p className="text-white/80 mb-4">
              Both players must confirm their bet of {currentRoom.betAmount} SOL
              to start the battle
            </p>
            <div className="flex justify-center gap-4">
              <Badge
                variant="secondary"
                className={`${
                  currentRoom.player1?.betPaid
                    ? "bg-green-500/20 text-green-300"
                    : "bg-red-500/20 text-red-300"
                }`}
              >
                {currentRoom.player1?.name}:{" "}
                {currentRoom.player1?.betPaid ? "Paid ✓" : "Pending"}
              </Badge>
              <Badge
                variant="secondary"
                className={`${
                  currentRoom.player2?.betPaid
                    ? "bg-green-500/20 text-green-300"
                    : "bg-red-500/20 text-red-300"
                }`}
              >
                {currentRoom.player2?.name}:{" "}
                {currentRoom.player2?.betPaid ? "Paid ✓" : "Pending"}
              </Badge>
            </div>
            {isProcessingBet && (
              <div className="mt-4 text-yellow-300">
                Processing your bet payment...
              </div>
            )}
          </Card>
        )}

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
            <p className="text-white/80 mb-4">
              Final Score: {currentRoom.player1?.name}{" "}
              {currentRoom.player1?.clicks} - {currentRoom.player2?.clicks}{" "}
              {currentRoom.player2?.name}
            </p>
            {currentRoom.winner !== "Tie" && (
              <p className="text-green-300 font-bold">
                Winner receives:{" "}
                {(currentRoom.totalPot * (100 - GAME_FEE_PERCENTAGE)) / 100} SOL
              </p>
            )}
          </Card>
        )}

        {currentRoom?.status === "payout" &&
          currentRoom.winner === currentPlayer?.name && (
            <Card className="bg-green-500/20 border-green-500/30 p-6 mb-6 text-center">
              <Trophy className="w-12 h-12 mx-auto text-green-400 mb-4" />
              <h2 className="text-2xl font-bold text-green-300 mb-4">
                Congratulations! You Won!
              </h2>
              <Button
                onClick={claimWinnings}
                size="lg"
                disabled={isClaimingWinnings}
                className="bg-green-600 hover:bg-green-700"
              >
                {isClaimingWinnings
                  ? "Claiming..."
                  : `Claim ${
                      (currentRoom.totalPot * (100 - GAME_FEE_PERCENTAGE)) / 100
                    } SOL`}
              </Button>
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
                      : "Game Over"}
                  </Badge>

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
