// SocketContext - udostępnia instancję socket.io-client w drzewie React i zarządza
// auto-redirectem do aktywnego pokoju. Połączenie samo nie jest tutaj tworzone -
// utworzy je connectSocket() z AuthContextu po zalogowaniu; tutaj tylko obserwujemy
// jego stan.
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import type { Socket } from "socket.io-client";
import { getSocket } from "@/lib/socket";
import { useAuth } from "./AuthContext";
import { useNavigate, useLocation } from "react-router-dom";

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
});

export function SocketProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  // Trzymamy aktualny location w ref, żeby callbacki na evenetach socketu czytały
  // świeżą wartość bez konieczności re-podpinania listenera przy każdej zmianie URL.
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  useEffect(() => {
    if (!token) {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      setSocket(null);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      setIsConnected(false);
      return;
    }

    // checkSocket próbuje pobrać singleton; jeśli nie istnieje (np. AuthContext
    // jeszcze nie wywołał connectSocket), poll co 1s, aż się pojawi.
    const checkSocket = () => {
      const s = getSocket();
      if (s) {
        setSocket(s);
        setIsConnected(s.connected);

        s.on("connect", () => {
          setIsConnected(true);
          // Po (re)connect pytamy serwer o aktywny pokój - jeśli user jest w nim,
          // nawigacja przeniesie go z neutralnej strony do gry/poczekalni.
          s.emit("user:get_active_room");
        });
        s.on("disconnect", () => setIsConnected(false));

        // Auto-redirect: jeśli user ma aktywny pokój, a stoi na "/" lub "/lobby/*",
        // przekieruj go bezpośrednio do tego pokoju lub do trwającej gry.
        // Nie ruszamy go, gdy jest już na /room/* lub /game/* (mógłby utknąć w pętli).
        s.on(
          "user:active_room",
          (data: { code: string; gameType: string; status: string } | null) => {
            if (!data) return;
            const path = locationRef.current.pathname;
            if (
              path.startsWith("/room/") ||
              path.startsWith("/game/") ||
              path === "/my-room"
            )
              return;
            if (path === "/" || path.startsWith("/lobby/")) {
              if (data.status === "in_progress") {
                navigate(`/game/${data.gameType}/${data.code}`);
              } else {
                navigate(`/room/${data.code}`);
              }
            }
          },
        );
      }
    };

    checkSocket();
    const interval = setInterval(checkSocket, 1000);

    return () => {
      clearInterval(interval);
      const s = getSocket();
      if (s) {
        s.off("connect");
        s.off("disconnect");
        s.off("user:active_room");
      }
    };
  }, [token, navigate]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
