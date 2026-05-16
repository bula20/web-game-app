// Strona rozgrywki w kalambury. Drawer rysuje na canvasie, pozostali zgadują w czacie.
// Strokes (kreski) są broadcastowane: w trakcie rysowania - charades:stroke_live
// (live preview), po podniesieniu palca/myszy - charades:stroke (cała kreska
// zapisywana w state'cie po stronie serwera). Zgadywanie:
//   - dokładne trafienie -> charades:correct_guess + punkty,
//   - prawie -> charades:close_guess (wyświetlamy "ciepło" w UI),
//   - chybione -> normalna wiadomość w czacie.
// Po zakończeniu rundy serwer wysyła charades:round_end z punktami i wybiera
// następnego drawera, dopóki nie skończy się pula rund.
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSocket } from '@/context/SocketContext';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Eraser } from 'lucide-react';
import { DisconnectBanner } from '@/components/DisconnectBanner';
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
  const { user, setActiveRoomCode } = useAuth();
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
  const lastEmitRef = useRef(0);
  const lastEmittedIdxRef = useRef(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [guesses]);

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
      setActiveRoomCode(null);
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
    lastEmittedIdxRef.current = 0;
    lastEmitRef.current = 0;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawingRef.current || !isDrawer) return;
    const point = getCanvasPoint(e);
    const points = currentStrokeRef.current;
    points.push(point);

    // Draw locally
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || points.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = drawWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(points[points.length - 2].x, points[points.length - 2].y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();

    // Stream accumulated points since last emit (throttled to ~60fps)
    if (!socket || !code) return;
    const now = Date.now();
    if (now - lastEmitRef.current < 16) return;
    lastEmitRef.current = now;
    const segment = points.slice(lastEmittedIdxRef.current);
    if (segment.length >= 2) {
      socket.emit('charades:draw', { code, stroke: { points: segment, color: drawColor, width: drawWidth } });
      // Overlap by 1 so the next segment starts exactly where this one ended
      lastEmittedIdxRef.current = points.length - 1;
    }
  };

  const handlePointerUp = () => {
    if (!isDrawingRef.current || !isDrawer || !socket || !code) return;
    isDrawingRef.current = false;

    // Flush all remaining unsent points
    const points = currentStrokeRef.current;
    const remaining = points.slice(lastEmittedIdxRef.current);
    if (remaining.length >= 2) {
      socket.emit('charades:draw', { code, stroke: { points: remaining, color: drawColor, width: drawWidth } });
    }
    currentStrokeRef.current = [];
    lastEmittedIdxRef.current = 0;
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
    setActiveRoomCode(null);
    navigate('/');
  };

  return (
    <div className="flex h-full gap-4 overflow-hidden">
      <div className="flex flex-col gap-3 flex-1 min-w-0 overflow-y-auto">
        <div className="w-full">
          <DisconnectBanner />
        </div>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, width: '100%', flexWrap: 'wrap',
        }}>
          {/* Left: role + word */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 15,
              color: 'var(--pr-light)',
              background: 'rgba(255,247,232,0.08)',
              border: '1px solid var(--pr-border-dark)',
              borderRadius: 20, padding: '6px 14px',
            }}>
              {isDrawer ? t('charades.yourTurnToDraw') : `${currentDrawer} rysuje`}
            </span>
            {isDrawer && word && (
              <span style={{
                fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 15,
                color: '#fff',
                background: 'linear-gradient(180deg, var(--pr-primary), var(--pr-primary-600))',
                borderRadius: 20, padding: '6px 16px',
                boxShadow: '0 4px 14px rgba(255,106,0,0.35)',
              }}>
                {t('charades.draw', { word })}
              </span>
            )}
          </div>

          {/* Right: round + timer + leave */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {totalCycles !== null && (
              <span style={{
                fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 14,
                color: 'var(--pr-light)',
                background: 'rgba(0,119,255,0.15)',
                border: '1px solid rgba(0,119,255,0.3)',
                borderRadius: 20, padding: '5px 14px',
              }}>
                {t('charades.round', { current: currentCycle, total: totalCycles })}
              </span>
            )}
            <span style={{
              fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 26,
              color: timeLeft <= 10 ? '#FCA5A5' : 'var(--pr-light)',
              minWidth: 56, textAlign: 'right',
              transition: 'color .3s',
            }}>
              {timeLeft}s
            </span>
            {!gameOver && (
              <button className="pr-btn pr-btn-sm" onClick={handleLeave} style={{
                whiteSpace: 'nowrap',
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.4)',
                color: '#FCA5A5',
              }}>
                {t('charades.leaveGame')}
              </button>
            )}
          </div>
        </div>

        {/* Canvas */}
        <div style={{ borderRadius: 14, overflow: 'hidden', background: '#fff', boxShadow: '0 4px 24px rgba(0,0,0,0.25)', width: '100%', flex: '1 1 0', minHeight: 0 }}>
          <canvas
            ref={canvasRef}
            width={800}
            height={580}
            className="w-full h-full cursor-crosshair"
            style={{ display: 'block', objectFit: 'contain' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
        </div>

        {/* Drawing tools */}
        {isDrawer && (
          <div className="pr-draw-tools flex items-center gap-2 flex-wrap justify-center w-full">
            <div className="flex gap-1 flex-wrap justify-center">
              {COLORS.map(color => (
                <button
                  key={color}
                  className={`pr-color-swatch rounded-full border-2 ${drawColor === color ? 'border-foreground scale-110' : 'border-border'}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setDrawColor(color)}
                />
              ))}
            </div>
            <div className="flex gap-1">
              {WIDTHS.map(w => (
                <button
                  key={w}
                  className={`pr-width-swatch rounded flex items-center justify-center border ${drawWidth === w ? 'border-foreground bg-muted' : 'border-border'}`}
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

        {gameOver && (() => {
          const sorted = [...scores].sort((a, b) => b.points - a.points);
          const myIdx = sorted.findIndex(s => s.userId === user?.id || s.displayName === user?.username);
          const myRank = myIdx + 1;
          const isFirst = myRank === 1;
          return (
            <div style={{
              position: 'fixed', inset: 0, zIndex: 60,
              background: 'rgba(4,18,43,0.78)', backdropFilter: 'blur(6px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div className="pr-card" style={{
                width: 'min(440px, 92vw)', textAlign: 'center', padding: '48px 40px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
              }}>
                {isFirst && (
                  <p style={{
                    fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 18,
                    color: 'var(--pr-primary)', margin: 0,
                    letterSpacing: '.03em',
                  }}>
                    {t('game.congratulations')}
                  </p>
                )}
                <h2 style={{
                  fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 30,
                  color: isFirst ? 'var(--pr-accent)' : 'var(--pr-light)',
                  margin: 0,
                }}>
                  {myRank > 0 ? t('game.place', { place: myRank }) : t('game.gameOver')}
                </h2>

                {/* Scoreboard */}
                <div style={{ width: '100%', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sorted.map((s, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px', borderRadius: 10,
                      background: s.userId === user?.id || s.displayName === user?.username
                        ? 'rgba(255,106,0,0.12)' : 'rgba(11,42,91,0.6)',
                      border: s.userId === user?.id || s.displayName === user?.username
                        ? '1px solid rgba(255,106,0,0.35)' : '1px solid var(--pr-border-dark)',
                    }}>
                      <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 16, color: 'var(--pr-text-muted)', width: 28 }}>
                        {i + 1}.
                      </span>
                      <span style={{ flex: 1, textAlign: 'left', fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 15, color: 'var(--pr-light)' }}>
                        {s.displayName}
                      </span>
                      <span style={{
                        fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 15,
                        color: 'var(--pr-primary)',
                        background: 'rgba(255,106,0,0.12)', borderRadius: 20, padding: '3px 12px',
                        border: '1px solid rgba(255,106,0,0.25)',
                      }}>
                        {s.points} pkt
                      </span>
                    </div>
                  ))}
                </div>

                <button className="pr-btn pr-btn-primary" style={{ marginTop: 8, width: '100%' }} onClick={() => navigate('/')}>
                  {t('game.backHome')}
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Sidebar: scores + guesses */}
      <div className="flex flex-col gap-4 w-64 shrink-0 h-full min-h-0">
        {/* Scores */}
        <Card className="shrink-0">
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
        <Card className="flex flex-col flex-1 min-h-0">
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
