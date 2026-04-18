import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSocket } from '@/context/SocketContext';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Eraser } from 'lucide-react';
import type { Stroke } from '@/types/game';

interface CharadesScore {
  userId: string | null;
  displayName: string;
  points: number;
}

const COLORS = ['#000000', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#ff8800', '#ffffff'];
const WIDTHS = [2, 4, 8, 12];

export function CharadesPage() {
  const { t } = useTranslation();
  const { code } = useParams<{ code: string }>();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isDrawer, setIsDrawer] = useState(false);
  const [word, setWord] = useState('');
  const [currentDrawer, setCurrentDrawer] = useState('');
  const [timeLeft, setTimeLeft] = useState(60);
  const [scores, setScores] = useState<CharadesScore[]>([]);
  const [guesses, setGuesses] = useState<{ player: string; text: string; correct: boolean; close?: boolean }[]>([]);
  const [guessText, setGuessText] = useState('');
  const [gameOver, setGameOver] = useState(false);
  const [roundOver, setRoundOver] = useState(false);
  const [lastWord, setLastWord] = useState('');
  const [drawColor, setDrawColor] = useState('#000000');
  const [drawWidth, setDrawWidth] = useState(4);
  const [currentCycle, setCurrentCycle] = useState(1);
  const [totalCycles, setTotalCycles] = useState<number | null>(null);

  // Drawing state
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<{ x: number; y: number }[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [guesses]);

  useEffect(() => {
    if (!socket || !code) return;

    // Request current game state on mount — handles the race where charades:new_round
    // fires before CharadesPage has finished mounting and registered its listeners.
    socket.emit('charades:get_state', { code });

    socket.on('charades:state', (data: {
      drawerSocketId: string;
      drawerName: string;
      timeLeft: number;
      scores: CharadesScore[];
      word?: string;
      cycle?: number;
      totalCycles?: number;
    }) => {
      setCurrentDrawer(data.drawerName);
      setIsDrawer(data.drawerSocketId === socket.id);
      setTimeLeft(data.timeLeft);
      setScores(data.scores);
      if (data.word) setWord(data.word);
      if (data.cycle) setCurrentCycle(data.cycle);
      if (data.totalCycles) setTotalCycles(data.totalCycles);
    });

    socket.on('charades:new_round', (data: { drawer: string; drawerName: string; timeLeft: number; cycle?: number; totalCycles?: number }) => {
      setCurrentDrawer(data.drawerName);
      setIsDrawer(data.drawer === socket.id);
      setTimeLeft(data.timeLeft);
      setRoundOver(false);
      setGuesses([]);
      clearCanvas();
      if (data.cycle) setCurrentCycle(data.cycle);
      if (data.totalCycles) setTotalCycles(data.totalCycles);
    });

    socket.on('charades:word', ({ word: w }: { word: string }) => {
      setWord(w);
    });

    socket.on('charades:draw', ({ stroke }: { stroke: Stroke }) => {
      drawStroke(stroke);
    });

    socket.on('charades:cleared', () => {
      clearCanvas();
    });

    socket.on('charades:guess_result', (data: { player: string; text: string; correct: boolean; close?: boolean }) => {
      setGuesses(prev => [...prev, data]);
    });

    socket.on('charades:round_over', ({ word: w, scores: s }: { word: string; scores: CharadesScore[] }) => {
      setRoundOver(true);
      setLastWord(w);
      setScores(s);
    });

    socket.on('charades:game_over', ({ scores: s }: { scores: CharadesScore[] }) => {
      setGameOver(true);
      setScores(s);
    });

    socket.on('charades:timer', ({ timeLeft: tl }: { timeLeft: number }) => {
      setTimeLeft(tl);
    });

    // Joined mid-game: server sends current state so we can sync UI
    socket.on('charades:current_state', (data: {
      drawerSocketId: string;
      drawerName: string;
      timeLeft: number;
      scores: CharadesScore[];
    }) => {
      setCurrentDrawer(data.drawerName);
      setIsDrawer(data.drawerSocketId === socket.id);
      setTimeLeft(data.timeLeft);
      setScores(data.scores);
    });

    // Another player joined mid-game
    socket.on('charades:player_joined', ({ scores: s }: { scores: CharadesScore[] }) => {
      setScores(s);
    });

    return () => {
      socket.off('charades:new_round');
      socket.off('charades:word');
      socket.off('charades:draw');
      socket.off('charades:cleared');
      socket.off('charades:guess_result');
      socket.off('charades:round_over');
      socket.off('charades:game_over');
      socket.off('charades:timer');
      socket.off('charades:state');
      socket.off('charades:current_state');
      socket.off('charades:player_joined');
    };
  }, [socket, code]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const drawStroke = (stroke: Stroke) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || stroke.points.length < 2) return;

    ctx.beginPath();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
  };

  const getCanvasPoint = (e: React.PointerEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isDrawer || gameOver || roundOver) return;
    isDrawingRef.current = true;
    currentStrokeRef.current = [getCanvasPoint(e)];
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawingRef.current || !isDrawer) return;
    const point = getCanvasPoint(e);
    currentStrokeRef.current.push(point);

    // Draw locally
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const points = currentStrokeRef.current;
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = drawWidth;
    ctx.lineCap = 'round';
    ctx.moveTo(points[points.length - 2].x, points[points.length - 2].y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  };

  const handlePointerUp = () => {
    if (!isDrawingRef.current || !isDrawer || !socket || !code) return;
    isDrawingRef.current = false;

    const stroke: Stroke = {
      points: currentStrokeRef.current,
      color: drawColor,
      width: drawWidth,
    };
    socket.emit('charades:draw', { code, stroke });
    currentStrokeRef.current = [];
  };

  const handleClear = () => {
    if (!socket || !code || !isDrawer) return;
    clearCanvas();
    socket.emit('charades:clear', { code });
  };

  const handleGuess = () => {
    if (!guessText.trim() || !socket || !code || isDrawer) return;
    socket.emit('charades:guess', { code, text: guessText.trim() });
    setGuessText('');
  };

  const handleLeave = () => {
    if (!window.confirm(t('charades.leaveConfirm'))) return;
    if (socket && code) socket.emit('charades:leave', { code });
    navigate('/');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 flex flex-col items-center gap-4">
        {/* Header */}
        <div className="flex items-center gap-4 w-full justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {isDrawer ? t('charades.yourTurnToDraw') : `${currentDrawer} ${t('charades.guessing')}`}
            </Badge>
            {isDrawer && word && (
              <Badge>{t('charades.draw', { word })}</Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            {totalCycles !== null && (
              <Badge variant="secondary">
                {t('charades.round', { current: currentCycle, total: totalCycles })}
              </Badge>
            )}
            <div className="text-2xl font-mono font-bold">{timeLeft}s</div>
            {!gameOver && (
              <Button variant="outline" size="sm" onClick={handleLeave}>
                {t('charades.leaveGame')}
              </Button>
            )}
          </div>
        </div>

        {/* Canvas */}
        <div className="border-2 border-border rounded-lg overflow-hidden bg-white">
          <canvas
            ref={canvasRef}
            width={700}
            height={500}
            className="w-full max-w-[700px] cursor-crosshair"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
        </div>

        {/* Drawing tools */}
        {isDrawer && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1">
              {COLORS.map(color => (
                <button
                  key={color}
                  className={`w-8 h-8 rounded-full border-2 ${drawColor === color ? 'border-foreground scale-110' : 'border-border'}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setDrawColor(color)}
                />
              ))}
            </div>
            <div className="flex gap-1">
              {WIDTHS.map(w => (
                <button
                  key={w}
                  className={`w-8 h-8 rounded flex items-center justify-center border ${drawWidth === w ? 'border-foreground bg-muted' : 'border-border'}`}
                  onClick={() => setDrawWidth(w)}
                >
                  <div className="rounded-full bg-foreground" style={{ width: w, height: w }} />
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={handleClear}>
              <Eraser className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </div>
        )}

        {/* Round/Game over */}
        {roundOver && !gameOver && (
          <Card className="w-full max-w-md text-center">
            <CardContent className="py-4">
              <p className="text-lg font-medium">{t('charades.roundOver', { word: lastWord })}</p>
            </CardContent>
          </Card>
        )}

        {gameOver && (
          <Card className="w-full max-w-md text-center">
            <CardContent className="py-6">
              <h2 className="text-2xl font-bold mb-2">{t('game.gameOver')}</h2>
              <Button className="mt-4" onClick={() => navigate('/')}>
                {t('nav.home')}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Sidebar: scores + guesses */}
      <div className="space-y-4">
        {/* Scores */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{t('charades.scores')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {scores.sort((a, b) => b.points - a.points).map((s, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span>{s.displayName}</span>
                  <Badge variant="secondary">{s.points} pts</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Guesses */}
        <Card className="flex flex-col h-[400px]">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Chat</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col overflow-hidden min-h-0 pb-3">
            <ScrollArea className="flex-1 min-h-0 mb-3">
              <div className="space-y-1">
                {guesses.map((g, i) => (
                  <div key={i}>
                    <div className={`text-sm ${g.correct ? 'text-green-600 font-bold' : ''}`}>
                      <span className="font-medium">{g.player}: </span>
                      <span>{g.correct ? t('charades.correct', { player: g.player }) : g.text}</span>
                    </div>
                    {g.close && !g.correct && (
                      <div className="text-sm text-orange-500 font-medium pl-2">{t('charades.close')}</div>
                    )}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            </ScrollArea>
            {!isDrawer && !gameOver && (
              <div className="flex gap-2">
                <Input
                  value={guessText}
                  onChange={e => setGuessText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleGuess()}
                  placeholder={t('charades.guess')}
                  className="flex-1"
                />
                <Button size="icon" onClick={handleGuess}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
