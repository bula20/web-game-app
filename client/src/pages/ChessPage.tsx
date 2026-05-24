

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSocket } from "@/context/SocketContext";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Flag } from "lucide-react";
import { ChessPiece } from "@/components/chess/ChessPiece";
import { DisconnectBanner } from "@/components/DisconnectBanner";
import type { ChatMessage } from "@/types/game";

type Square = string | null;
type Board = Square[][];

const BOARD_SIZE = 8;
const SQUARE_SIZE = 78;
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];


function squareToAlgebraic(row: number, col: number): string {
  return String.fromCharCode(97 + col) + String(8 - row);
}


function algebraicToSquare(sq: string): [number, number] {
  const col = sq.charCodeAt(0) - 97;
  const row = 8 - parseInt(sq[1], 10);
  return [row, col];
}

export function ChessPage() {
  const { t } = useTranslation();
  const { code } = useParams<{ code: string }>();
  const { socket } = useSocket();
  const { user, setActiveRoomCode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [board, setBoard] = useState<Board>([]);
  const [turn, setTurn] = useState<"w" | "b">("w");
  const [playerColor, setPlayerColor] = useState<"w" | "b">("w");
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [validMoves, setValidMoves] = useState<string[]>([]);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [timeWhite, setTimeWhite] = useState(600);
  const [timeBlack, setTimeBlack] = useState(600);
  const [gameOver, setGameOver] = useState(false);
  const [result, setResult] = useState("");
  const [moveHistory, setMoveHistory] = useState<
    { san: string; color: string }[]
  >([]);
  const [showPromotion, setShowPromotion] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [inCheck, setInCheck] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [mobileView, setMobileView] = useState<"board" | "chat">("board");

  const playerColorRef = useRef(playerColor);
  useEffect(() => {
    playerColorRef.current = playerColor;
  }, [playerColor]);

  const boardContainerRef = useRef<HTMLDivElement>(null);
  const [squareSize, setSquareSize] = useState(SQUARE_SIZE);
  const historyEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = boardContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      const byW = Math.floor((width - 28) / 8);
      const byH = Math.floor((height - 44) / 8);
      setSquareSize(Math.max(38, Math.min(SQUARE_SIZE, byW, byH)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [moveHistory]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!socket || !code) return;

    const initFromData = (data: {
      white: string;
      black: string;
      board: Board;
      turn: "w" | "b";
      timeWhite: number;
      timeBlack: number;
      moves?: string[];
      isCheck?: boolean;
    }) => {
      setBoard(data.board);
      setTurn(data.turn);
      const myColor = data.white === socket.id ? "w" : "b";
      setPlayerColor(myColor);
      setIsMyTurn(data.turn === myColor);
      setTimeWhite(data.timeWhite);
      setTimeBlack(data.timeBlack);
      setInCheck(data.isCheck ?? false);
      if (data.moves) {
        setMoveHistory(
          data.moves.map((san, i) => ({
            san,
            color: i % 2 === 0 ? "w" : "b",
          })),
        );
      }
    };

    socket.on("chess:start", initFromData);
    socket.on("chess:state", initFromData);

    socket.on(
      "chess:moved",
      (data: {
        board: Board;
        turn: "w" | "b";
        timeWhite: number;
        timeBlack: number;
        san: string;
        color: string;
        isCheck: boolean;
      }) => {
        setBoard(data.board);
        setTurn(data.turn);
        setIsMyTurn(data.turn === playerColorRef.current);
        setTimeWhite(data.timeWhite);
        setTimeBlack(data.timeBlack);
        setMoveHistory((prev) => [
          ...prev,
          { san: data.san, color: data.color },
        ]);
        setSelectedSquare(null);
        setValidMoves([]);
        setInCheck(data.isCheck);
      },
    );

    socket.on("chess:valid_moves", (data: { moves: string[] }) => {
      setValidMoves(data.moves);
    });

    
    
    socket.on("chess:invalid_move", () => {
      
    });

    socket.on(
      "chess:game_over",
      ({ result: r, reason }: { result: string; reason: string }) => {
        setGameOver(true);
        setResult(`${r} - ${reason}`);
        
        
        setActiveRoomCode(null);
      },
    );

    socket.on(
      "chess:timer_update",
      ({
        timeWhite: tw,
        timeBlack: tb,
      }: {
        timeWhite: number;
        timeBlack: number;
      }) => {
        setTimeWhite(tw);
        setTimeBlack(tb);
      },
    );

    socket.on("chat:room_message", (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    });

    
    
    if (location.state?.white && location.state?.board) {
      initFromData(location.state as Parameters<typeof initFromData>[0]);
    }

    
    
    socket.emit("chess:get_state", { code });

    return () => {
      socket.off("chess:start");
      socket.off("chess:state");
      socket.off("chess:moved");
      socket.off("chess:valid_moves");
      socket.off("chess:invalid_move");
      socket.off("chess:game_over");
      socket.off("chess:timer_update");
      socket.off("chat:room_message");
    };
  }, [socket, code]);

  const handleSquareClick = useCallback(
    (row: number, col: number) => {
      if (gameOver || !socket || !code || !isMyTurn || showPromotion) return;

      const clickedAlg = squareToAlgebraic(row, col);
      const piece = board[row]?.[col];

      
      if (selectedSquare) {
        const isValid = validMoves.includes(clickedAlg);
        if (isValid) {
          
          const [fromRow] = algebraicToSquare(selectedSquare);
          const fromPiece =
            board[fromRow]?.[algebraicToSquare(selectedSquare)[1]];
          const isPawn = fromPiece?.toLowerCase() === "p";
          const isLastRank =
            (playerColor === "w" && row === 0) ||
            (playerColor === "b" && row === 7);

          if (isPawn && isLastRank) {
            setShowPromotion({ from: selectedSquare, to: clickedAlg });
            return;
          }

          socket.emit("chess:move", {
            code,
            from: selectedSquare,
            to: clickedAlg,
          });
          setSelectedSquare(null);
          setValidMoves([]);
          return;
        }
      }

      
      const myColorChar = playerColor;
      if (piece) {
        const pieceColor = piece === piece.toUpperCase() ? "w" : "b";
        if (pieceColor === myColorChar) {
          setSelectedSquare(clickedAlg);
          socket.emit("chess:get_moves", { code, position: clickedAlg });
          return;
        }
      }

      
      setSelectedSquare(null);
      setValidMoves([]);
    },
    [
      board,
      selectedSquare,
      validMoves,
      isMyTurn,
      gameOver,
      socket,
      code,
      playerColor,
      showPromotion,
    ],
  );

  const handlePromotion = useCallback(
    (piece: string) => {
      if (!showPromotion || !socket || !code) return;
      socket.emit("chess:move", {
        code,
        from: showPromotion.from,
        to: showPromotion.to,
        promotion: piece,
      });
      setShowPromotion(null);
      setSelectedSquare(null);
      setValidMoves([]);
    },
    [showPromotion, socket, code],
  );

  const handleResign = () => {
    if (socket && code) socket.emit("chess:resign", { code });
    setActiveRoomCode(null);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const sendMessage = () => {
    if (!messageText.trim() || !socket || !code) return;
    socket.emit("chat:room_message", { code, text: messageText.trim() });
    setMessages((prev) => [
      ...prev,
      {
        from: user?.username || "You",
        text: messageText.trim(),
        timestamp: new Date().toISOString(),
      },
    ]);
    setMessageText("");
  };

  
  const findKingSquare = (): string | null => {
    if (!inCheck || board.length === 0) return null;
    const kingPiece = turn === "w" ? "K" : "k";
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (board[r][c] === kingPiece) return squareToAlgebraic(r, c);
      }
    }
    return null;
  };

  const kingInCheckSquare = findKingSquare();

  const renderBoard = () => {
    const flipped = playerColor === "b";
    const rows = flipped
      ? [...Array(BOARD_SIZE).keys()].reverse()
      : [...Array(BOARD_SIZE).keys()];
    const cols = flipped
      ? [...Array(BOARD_SIZE).keys()].reverse()
      : [...Array(BOARD_SIZE).keys()];

    const displayFiles = flipped ? [...FILES].reverse() : FILES;

    return (
      <div className="pr-board-frame inline-block">
        <div className="flex">
          
          <div className="flex flex-col" style={{ width: 24 }}>
            {rows.map((row) => (
              <div
                key={row}
                className="flex items-center justify-center text-xs font-bold"
                style={{
                  height: squareSize,
                  color: "rgba(255,247,232,0.55)",
                  fontFamily: "var(--font-head)",
                }}
              >
                {RANKS[row]}
              </div>
            ))}
          </div>

          
          <div
            style={{
              borderRadius: 8,
              overflow: "hidden",
              boxShadow: "0 0 0 1px rgba(217,227,240,0.18)",
            }}
          >
            {rows.map((row) => (
              <div key={row} className="flex">
                {cols.map((col) => {
                  const isLight = (row + col) % 2 === 0;
                  const piece = board[row]?.[col];
                  const alg = squareToAlgebraic(row, col);
                  const isSelected = selectedSquare === alg;
                  const isValid = validMoves.includes(alg);
                  const isKingCheck = kingInCheckSquare === alg;

                  const baseBg = isLight ? "#FFF7E8" : "#0E3270";
                  const bg = isKingCheck ? "rgba(239,68,68,0.55)" : baseBg;
                  const ring = isSelected
                    ? "inset 0 0 0 3px var(--pr-primary)"
                    : "none";

                  return (
                    <div
                      key={col}
                      className="relative flex items-center justify-center cursor-pointer"
                      style={{
                        width: squareSize,
                        height: squareSize,
                        background: bg,
                        boxShadow: ring,
                        transition: "background-color .12s",
                      }}
                      onClick={() => handleSquareClick(row, col)}
                    >
                      {piece && (
                        <ChessPiece piece={piece} size={squareSize - 8} />
                      )}
                      {isValid && !piece && (
                        <div className="w-4 h-4 rounded-full bg-black/25" />
                      )}
                      {isValid && piece && (
                        <div
                          className="absolute inset-0 rounded-sm"
                          style={{
                            background:
                              "radial-gradient(transparent 55%, rgba(0, 0, 0, 0.3) 55%)",
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        
        <div className="flex" style={{ paddingLeft: 24 }}>
          {displayFiles.map((file) => (
            <div
              key={file}
              className="flex items-center justify-center text-xs font-medium text-muted-foreground"
              style={{ width: squareSize, height: 20 }}
            >
              {file}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderPromotionDialog = () => {
    if (!showPromotion) return null;

    const pieces =
      playerColor === "w" ? ["Q", "R", "B", "N"] : ["q", "r", "b", "n"];
    const promotionValues = ["q", "r", "b", "n"];

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <Card className="p-4">
          <CardContent className="flex flex-col items-center gap-3 pt-2">
            <p className="text-sm font-medium">
              {t("game.promotion", "Choose promotion piece")}
            </p>
            <div className="flex gap-2">
              {pieces.map((piece, i) => (
                <button
                  key={piece}
                  className="w-16 h-16 flex items-center justify-center border-2 border-foreground/20 rounded hover:bg-accent transition-colors"
                  onClick={() => handlePromotion(promotionValues[i])}
                >
                  <ChessPiece piece={piece} size={48} />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="pr-game-root flex h-full gap-4 overflow-hidden">
      <div className="pr-game-tabs">
        <button
          className={`pr-game-tab ${mobileView === "board" ? "is-active" : ""}`}
          onClick={() => setMobileView("board")}
        >
          {t("game.tabBoard", "Plansza")}
        </button>
        <button
          className={`pr-game-tab ${mobileView === "chat" ? "is-active" : ""}`}
          onClick={() => setMobileView("chat")}
        >
          {t("game.tabChat", "Czat")}
        </button>
      </div>
      <div
        className="pr-game-board-col flex flex-col items-center gap-2 flex-1 min-w-0 overflow-hidden py-1"
        data-mobile-hidden={mobileView !== "board"}
      >
        <div className="w-full shrink-0">
          <DisconnectBanner />
        </div>
        
        <div className="text-xl font-mono font-bold shrink-0">
          {formatTime(playerColor === "w" ? timeBlack : timeWhite)}
        </div>

        <div
          ref={boardContainerRef}
          className="flex-1 w-full flex items-center justify-center min-h-0"
        >
          {board.length > 0 ? (
            renderBoard()
          ) : (
            <div className="text-muted-foreground">{t("game.waiting")}</div>
          )}
        </div>

        
        <div className="text-xl font-mono font-bold shrink-0">
          {formatTime(playerColor === "w" ? timeWhite : timeBlack)}
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap justify-center pb-1">
          <Badge variant={isMyTurn ? "default" : "secondary"}>
            {isMyTurn ? t("game.yourTurn") : t("game.opponentTurn")}
          </Badge>
          <Badge variant="outline">
            {playerColor === "w" ? t("game.white") : t("game.black")}
          </Badge>
          {inCheck && (
            <Badge variant="destructive">{t("game.check", "Check!")}</Badge>
          )}
          {!gameOver && (
            <Button variant="destructive" size="sm" onClick={handleResign}>
              <Flag className="h-4 w-4 mr-1" />
              {t("game.resign")}
            </Button>
          )}
        </div>

        {gameOver &&
          (() => {
            const [winner, reason] = result.split(" - ");
            const isWin =
              (winner === "white" && playerColor === "w") ||
              (winner === "black" && playerColor === "b");
            const isDraw = winner === "draw";
            return (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 60,
                  background: "rgba(4,18,43,0.78)",
                  backdropFilter: "blur(6px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  className="pr-card"
                  style={{
                    width: "min(380px, 92vw)",
                    textAlign: "center",
                    padding: "48px 40px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 16,
                  }}
                >
                  <h2
                    style={{
                      fontFamily: "var(--font-head)",
                      fontWeight: 800,
                      fontSize: 32,
                      color: isWin
                        ? "var(--pr-accent)"
                        : isDraw
                          ? "var(--pr-light)"
                          : "#FCA5A5",
                      margin: 0,
                    }}
                  >
                    {isWin
                      ? t("game.youWin")
                      : isDraw
                        ? t("game.draw")
                        : t("game.youLose")}
                  </h2>
                  {reason && (
                    <p
                      style={{
                        color: "var(--pr-text-secondary)",
                        fontSize: 15,
                        margin: 0,
                      }}
                    >
                      {isDraw
                        ? t(`game.reason.${reason}`, reason)
                        : t(
                            `game.reason.${reason}_${isWin ? "win" : "loss"}`,
                            t(`game.reason.${reason}`, reason),
                          )}
                    </p>
                  )}
                  <button
                    className="pr-btn pr-btn-primary"
                    style={{ marginTop: 8, width: "100%" }}
                    onClick={() => navigate("/")}
                  >
                    {t("game.backHome")}
                  </button>
                </div>
              </div>
            );
          })()}
      </div>

      
      <div
        className="pr-game-side-col flex flex-col gap-4 w-80 shrink-0 h-full min-h-0"
        data-mobile-hidden={mobileView !== "chat"}
      >
        
        <Card className="flex flex-col flex-1 min-h-0">
          <CardHeader className="pb-2 shrink-0">
            <CardTitle className="text-base">
              {t("game.moveHistory", "Move History")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="space-y-1 text-sm font-mono">
                {Array.from({ length: Math.ceil(moveHistory.length / 2) }).map(
                  (_, i) => {
                    const whiteMove = moveHistory[i * 2];
                    const blackMove = moveHistory[i * 2 + 1];
                    return (
                      <div key={i} className="flex gap-2">
                        <span className="text-muted-foreground w-8 text-right">
                          {i + 1}.
                        </span>
                        <span className="w-20 font-semibold">
                          {whiteMove?.san || ""}
                        </span>
                        <span className="w-20 text-muted-foreground">
                          {blackMove?.san || ""}
                        </span>
                      </div>
                    );
                  },
                )}
                <div ref={historyEndRef} />
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        
        <Card className="flex flex-col h-72 shrink-0">
          <CardHeader className="pb-2 shrink-0">
            <CardTitle className="text-base">Chat</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col overflow-hidden min-h-0 pb-3">
            <ScrollArea className="flex-1 min-h-0 mb-3">
              <div className="space-y-2">
                {messages.map((msg, i) => (
                  <div key={i} className="text-sm">
                    <span className="font-medium">{msg.from}: </span>
                    <span className="text-muted-foreground">{msg.text}</span>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            </ScrollArea>
            <div className="flex gap-2">
              <Input
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder={t("friends.sendMessage")}
                className="flex-1"
              />
              <Button size="icon" onClick={sendMessage}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {renderPromotionDialog()}
    </div>
  );
}
