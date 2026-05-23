// AuthContext - centralne miejsce stanu uwierzytelnienia. Trzyma usera, token JWT
// (zsynchronizowany z localStorage), zarządza login/register/guest/Google OAuth oraz
// utrzymuje synchronizację pola activeRoomCode poprzez nasłuch na eventy z socketa.
// Token w localStorage przeżywa odświeżenie strony - useEffect na starcie wywołuje
// /auth/me, żeby zweryfikować token i odtworzyć obiekt usera.
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { User } from "@/types/user";
import api from "@/lib/api";
import { connectSocket, disconnectSocket, getSocket } from "@/lib/socket";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    username: string,
    email: string,
    password: string,
  ) => Promise<void>;
  loginAsGuest: () => Promise<void>;
  handleGoogleCallback: (token: string) => Promise<void>;
  logout: () => void;
  setActiveRoomCode: (code: string | null) => void;
  updateUser: (partial: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("token"),
  );
  const [isLoading, setIsLoading] = useState(true);

  // Wspólny helper dla login/register/guest - zapisuje token do storage,
  // ustawia state i nawiązuje połączenie socketowe (z tokenem w handshake).
  const setAuth = useCallback((newToken: string, newUser: User) => {
    localStorage.setItem("token", newToken);
    setToken(newToken);
    setUser(newUser);
    connectSocket(newToken);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    disconnectSocket();
  }, []);

  // Pomocnicze settery wywoływane np. po wejściu/wyjściu z pokoju, zmianie awatara itp.
  const setActiveRoomCode = useCallback((code: string | null) => {
    setUser((prev) => (prev ? { ...prev, activeRoomCode: code } : prev));
  }, []);

  const updateUser = useCallback((partial: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...partial } : prev));
  }, []);

  // Po pierwszym mountcie sprawdzamy czy istnieje token w localStorage. Jeśli tak,
  // pobieramy aktualne dane usera (na wypadek zmian od ostatniej sesji) i podłączamy socket.
  // Nieprawidłowy/wygasły token => /auth/me zwróci 401, axios przekieruje na /login,
  // a my czyścimy stan przez logout().
  useEffect(() => {
    if (token) {
      api
        .get("/auth/me")
        .then((res) => {
          setUser(res.data);
          connectSocket(token);
        })
        .catch(() => {
          logout();
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subskrypcja eventów socketu informujących o zmianie aktywnego pokoju.
  // user:active_room - emitowany przez serwer po połączeniu, jeśli user jest już w pokoju
  //   (np. wszedł z innej karty lub odświeżył stronę w trakcie gry).
  // user:active_room_changed - emitowany przy każdej zmianie (join/leave/finish).
  // Polling 500 ms próbuje "doczepić" listener również wtedy, gdy socket nie jest jeszcze
  // gotowy w momencie pierwszego renderu - po podpięciu interval staje się no-opem.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const attach = () => {
      const s = getSocket();
      if (!s) return false;

      const onChanged = (
        data: { code: string; gameType: string; status: string } | null,
      ) => {
        if (cancelled) return;
        setUser((prev) =>
          prev ? { ...prev, activeRoomCode: data?.code ?? null } : prev,
        );
      };
      const onActive = (
        data: { code: string; gameType: string; status: string } | null,
      ) => {
        if (cancelled) return;
        setUser((prev) =>
          prev ? { ...prev, activeRoomCode: data?.code ?? null } : prev,
        );
      };

      s.on("user:active_room_changed", onChanged);
      s.on("user:active_room", onActive);
      return () => {
        s.off("user:active_room_changed", onChanged);
        s.off("user:active_room", onActive);
      };
    };

    let detach = attach();
    const interval = window.setInterval(() => {
      if (!detach) detach = attach();
    }, 500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (typeof detach === "function") detach();
    };
  }, [token]);

  const login = async (email: string, password: string) => {
    const res = await api.post("/auth/login", { email, password });
    setAuth(res.data.token, res.data.user);
  };

  const register = async (
    username: string,
    email: string,
    password: string,
  ) => {
    const res = await api.post("/auth/register", { username, email, password });
    setAuth(res.data.token, res.data.user);
  };

  const loginAsGuest = async () => {
    const res = await api.post("/auth/guest");
    setAuth(res.data.token, res.data.user);
  };

  // Po Google OAuth serwer zwraca user na stronę /auth/callback?token=...
  // Token przekazujemy ręcznie w nagłówku, bo interceptor jeszcze go nie ma w storage.
  const handleGoogleCallback = async (callbackToken: string) => {
    localStorage.setItem("token", callbackToken);
    setToken(callbackToken);
    const res = await api.get("/auth/me", {
      headers: { Authorization: `Bearer ${callbackToken}` },
    });
    setUser(res.data);
    connectSocket(callbackToken);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        register,
        loginAsGuest,
        handleGoogleCallback,
        logout,
        setActiveRoomCode,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
