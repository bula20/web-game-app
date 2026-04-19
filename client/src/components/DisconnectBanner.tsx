import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSocket } from '@/context/SocketContext';

interface DisconnectedPlayer {
  userId: string;
  displayName: string;
  expiresIn: number;
}

export function DisconnectBanner() {
  const { t } = useTranslation();
  const { socket } = useSocket();
  const [disconnected, setDisconnected] = useState<Map<string, DisconnectedPlayer>>(new Map());

  useEffect(() => {
    if (!socket) return;

    const onDisconnected = ({ userId, displayName, expiresIn }: DisconnectedPlayer) => {
      setDisconnected(prev => {
        const next = new Map(prev);
        next.set(userId, { userId, displayName, expiresIn });
        return next;
      });
    };
    const onReconnected = ({ userId }: { userId: string }) => {
      setDisconnected(prev => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
    };
    const onExpired = ({ userId }: { userId: string }) => {
      setDisconnected(prev => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
    };

    socket.on('player:disconnected', onDisconnected);
    socket.on('player:reconnected', onReconnected);
    socket.on('player:reconnect_expired', onExpired);
    return () => {
      socket.off('player:disconnected', onDisconnected);
      socket.off('player:reconnected', onReconnected);
      socket.off('player:reconnect_expired', onExpired);
    };
  }, [socket]);

  // Countdown tick
  useEffect(() => {
    if (disconnected.size === 0) return;
    const tick = setInterval(() => {
      setDisconnected(prev => {
        const next = new Map<string, DisconnectedPlayer>();
        for (const [k, v] of prev) {
          if (v.expiresIn > 1) next.set(k, { ...v, expiresIn: v.expiresIn - 1 });
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [disconnected.size > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  if (disconnected.size === 0) return null;

  return (
    <div className="space-y-2">
      {Array.from(disconnected.values()).map(d => (
        <div
          key={d.userId}
          className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-800"
        >
          ⚠️ {t('game.playerDisconnected', { name: d.displayName, seconds: d.expiresIn })}
        </div>
      ))}
    </div>
  );
}
