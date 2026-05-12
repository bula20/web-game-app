# Dokumentacja aplikacji Web Game Platform

Aplikacja webowa do gier wieloosobowych (szachy, warcaby, kalambury) napisana
w architekturze klient-serwer z bazą danych MongoDB i komunikacją w czasie
rzeczywistym przez Socket.io.

---

## 1. Opis aplikacji

**Web Game Platform** to platforma do rozgrywek online dla zarejestrowanych
użytkowników i gości. Główne funkcje:

- **Trzy gry z silnikami napisanymi od zera:**
  - Szachy (pełne reguły FIDE: roszada, en passant, promocja, mat, pat,
    niewystarczający materiał, reguła 50 ruchów),
  - Warcaby (wymuszone bicia, multi-capture, promocja na damkę),
  - Kalambury (rysowanie na canvas live, zgadywanie z tolerancją literówek
    przez algorytm Levenshteina).
- **Dwa rodzaje kont:** zarejestrowany użytkownik (email/hasło lub Google OAuth)
  oraz gość (efemeryczne konto bez persystencji - można grać od razu).
- **System pokojów:** publiczne (widoczne w lobby) i prywatne (dostępne po kodzie),
  6-znakowy kod jako identyfikator.
- **System znajomych:** zaproszenia, akceptacja/odrzucenie, lista online/offline,
  prywatne wiadomości DM z historią.
- **Czat w pokoju** w trakcie i po grze.
- **Historia partii** - 50 ostatnich rozegranych gier per użytkownik.
- **Obsługa rozłączeń** - 3 różne grace periods (20 s w lobby, 20 s w grze,
  120 s dla hosta), banner z countdownem dla pozostałych graczy.
- **Wielojęzyczność** - polski i angielski (i18next + plik tłumaczeń per język).

Aplikacja powstała jako projekt studencki - prostota i czytelność są priorytetem
nad architekturą enterprise.

---

## 2. Stack technologiczny

### Backend (`server/`)

- **Środowisko:** Node.js 20 + TypeScript (ESM, target ES2022)
- **Framework HTTP:** Express 4
- **Komunikacja real-time:** Socket.io 4
- **Baza danych:** MongoDB 7 + Mongoose 8 (ODM)
- **Uwierzytelnianie:** JWT (jsonwebtoken) + bcryptjs (haszowanie haseł, 12 rund) +
  Passport.js z passport-google-oauth20 (logowanie przez Google)
- **Walidacja:** Zod
- **Generator id:** nanoid
- **CORS:** pakiet cors
- **Build:** tsx (watch mode w dev), tsup (bundle do dist/ na produkcji)

### Frontend (`client/`)

- **Framework:** React 19 + TypeScript (target ES2023)
- **Bundler:** Vite 8
- **Routing:** React Router DOM v7
- **Styling:** Tailwind CSS 4 + customowy design system w `index.css` +
  Radix UI primitives (wrapowane jako `components/ui/`)
- **Real-time:** socket.io-client 4
- **HTTP:** Axios z interceptorami (auto-attach JWT, redirect 401 na /login)
- **Formularze:** React Hook Form + Zod
- **Tłumaczenia:** i18next + react-i18next + i18next-http-backend +
  i18next-browser-languagedetector
- **Ikony:** lucide-react
- **Toasty:** sonner
- **Lint:** ESLint 9 (flat config)

### Infrastruktura

- **Docker Compose** - 3 kontenery:
  - `mongo` (mongo:7, port 27018:27017),
  - `server` (Node 20-Alpine, port 3001),
  - `client` (Node 20-Alpine, port 5173).
- W kontenerach kod montowany jako volume - zmiany w `src/` są od razu
  podchwytywane przez tsx watch / vite dev server.
- W trybie lokalnym (bez Dockera) wymagany lokalny MongoDB na porcie 27017.

---

## 3. Frameworki i biblioteki - rola każdej

### Backend

| Biblioteka | Rola |
|---|---|
| **Express** | Routing HTTP, middleware (CORS, JSON parser), serwowanie REST API |
| **Socket.io** | Połączenia WebSocket dla wszystkich zdarzeń live (gry, czat, lobby) |
| **Mongoose** | Schemat i walidacja modeli MongoDB, query builder, populacja relacji |
| **jsonwebtoken** | Generowanie i weryfikacja tokenów JWT (sesje stateless) |
| **bcryptjs** | Haszowanie haseł i porównywanie z timing-safe equality |
| **Passport.js** | Strategia Google OAuth 2.0 - obsługa przepływu autoryzacji |
| **Zod** | Walidacja danych wejściowych (rejestracja, login, room:create) |
| **nanoid** | 6-znakowy unikalny kod pokoju (Math.random + bezpieczny alfabet) |
| **dotenv** | Ładowanie zmiennych środowiskowych z pliku `.env` |

### Frontend

| Biblioteka | Rola |
|---|---|
| **React 19** | Framework UI, biblioteka komponentów, hooki |
| **Vite** | Dev server z HMR, bundling produkcyjny, plugin React |
| **React Router** | SPA routing po stronie klienta, ProtectedRoute, dynamic params |
| **Tailwind CSS** | Utility-first styling, motyw aplikacji w index.css |
| **Radix UI** | Dostępne primitives (Dialog, ScrollArea, Separator) |
| **socket.io-client** | Klient WebSocket z automatycznym reconnectem |
| **Axios** | Klient HTTP z interceptorami (JWT, 401 handling) |
| **React Hook Form** | Zarządzanie formularzami (login, register, profil) |
| **i18next** | System tłumaczeń, lazy loading paczek z `/locales/{lng}/` |
| **lucide-react** | Zestaw ikon SVG (LogIn, LogOut, Plus, X itp.) |
| **sonner** | Toasty informacyjne (success/error/info) |

---

## 4. Struktura plików

### Drzewo katalogu głównego

```
web-game-app/
├── client/                  Frontend React + Vite
├── server/                  Backend Node + Express + Socket.io
├── docker-compose.yml       Definicja 3 kontenerów (mongo, server, client)
├── README.md                Krótki opis projektu
├── CLAUDE.md                Wskazówki dla AI o projekcie
└── DOKUMENTACJA.md          Ten plik
```

### Backend - `server/src/`

```
server/src/
├── index.ts                  Entry point: connectDB + setupSocketServer + listen
├── app.ts                    Express app - middleware + routes + health check
│
├── config/
│   ├── env.ts                Ładowanie .env, fallbacki dev
│   ├── db.ts                 mongoose.connect (twardy exit przy błędzie)
│   └── passport.ts           Strategia Google OAuth (link konta po emailu)
│
├── middleware/
│   ├── auth.ts               JWT: generateToken, authMiddleware, optionalAuth
│   └── socketAuth.ts         JWT w handshake socketa, wzbogacanie socket.userId
│
├── models/                   Modele Mongoose
│   ├── User.ts               username, email, passwordHash, googleId, friends, avatar, activeRoomCode
│   ├── Room.ts               kod 6-znakowy, gracze, status (waiting/host_away/in_progress/finished)
│   ├── Game.ts               historia partii + pruneOldGames (limit 50/user)
│   ├── Message.ts            DM i wiadomości pokojowe
│   └── FriendRequest.ts      pending/accepted/rejected
│
├── routes/                   Routery Express
│   ├── auth.ts               /register, /login, /guest, /me, /google, /google/callback
│   ├── users.ts              /me/avatar, /me/password, /me/username (cooldown 7d), /search, /:id
│   ├── friends.ts            lista, /request, /requests, /accept/:id, /reject/:id, DELETE /:id
│   ├── rooms.ts              GET / (lista publicznych), GET /:code
│   └── games.ts              GET /history (paginacja), GET /:id
│
├── sockets/                  Handlery Socket.io
│   ├── index.ts              setup serwera, online users tracking, kolejność handlerów
│   ├── lobbyHandler.ts       lobby:join/leave, room:create/join/leave, sukcesja hosta
│   ├── presenceHandler.ts    3 grace periods (20/20/120 s), reconnect, walkower
│   ├── chessHandler.ts       game:start, chess:move/get_moves/resign, timer, endGame
│   ├── checkersHandler.ts    analogicznie + multi-capture
│   ├── charadesHandler.ts    state machine rund, drawing broadcast, Levenshtein
│   ├── chatHandler.ts        chat:room_message, chat:direct_message, history
│   └── guestState.ts         in-memory mapa goscie -> activeRoomCode
│
├── game-logic/               Czyste silniki gier (bez I/O)
│   ├── chess.ts              8x8 board, legalność ruchów, mat/pat, en passant
│   └── checkers.ts           wymuszone bicia, multi-capture, damki
│
└── data/
    └── words.json            Bank słów do kalamburów (PL+EN, kategoryzowane)
```

### Frontend - `client/src/`

```
client/src/
├── main.tsx                  Entry point React (StrictMode + i18n + App)
├── App.tsx                   Routing (BrowserRouter + AuthProvider + SocketProvider)
├── i18n.ts                   Konfiguracja i18next (HttpBackend, LanguageDetector)
├── index.css                 Design system (zmienne CSS, klasy .pr-*, gradients av-1..8)
│
├── context/
│   ├── AuthContext.tsx       user, token, login/register/guest/Google, activeRoomCode sync
│   └── SocketContext.tsx     instancja socketa, auto-redirect do aktywnego pokoju
│
├── lib/
│   ├── api.ts                axios + interceptory JWT/401
│   ├── socket.ts             singleton socket.io-client, connect/disconnect
│   ├── avatar.ts             avatarClass, avatarImgSrc, avatarClassFromId
│   └── utils.ts              cn() = clsx + twMerge
│
├── types/
│   ├── user.ts               User, Friend, FriendRequest, ActiveRoomInfo
│   ├── room.ts               Room, GameType, RoomStatus, RoomPlayer
│   └── game.ts               GameHistory, ChatMessage, Stroke
│
├── components/
│   ├── ui/                   Radix/shadcn primitives (Button, Card, Dialog, ScrollArea...)
│   ├── layout/
│   │   ├── Layout.tsx        Navbar + Sidebar + Outlet
│   │   ├── Navbar.tsx        Linki, Create Room, ProfilePanel toggle, language toggle
│   │   └── Sidebar.tsx       Friends + DM chat + zaproszenia (dla zalogowanych)
│   ├── dashboard/
│   │   ├── ActiveRoomCard.tsx   Karta z linkiem do aktywnego pokoju
│   │   └── RecentMatches.tsx    Lista N ostatnich partii
│   ├── room/
│   │   ├── CreateRoomDialog.tsx Modal tworzenia pokoju
│   │   └── JoinByCodeDialog.tsx Modal dołączania po kodzie
│   ├── profile/
│   │   └── ProfilePanel.tsx     Slide-in panel z 3 zakładkami
│   ├── chess/
│   │   └── ChessPiece.tsx       <img> z SVG figury (Cburnett style)
│   └── DisconnectBanner.tsx     Banner rozłączonych graczy z countdownem
│
└── pages/                    Jeden plik per ścieżka
    ├── HomePage.tsx          Landing lub Dashboard (zależnie od auth)
    ├── LoginPage.tsx         Email/hasło, Guest, Google OAuth
    ├── RegisterPage.tsx      Username/email/hasło
    ├── AuthCallbackPage.tsx  Odbiera ?token=... z Google
    ├── LobbyPage.tsx         Lista pokojów dla danego gameType
    ├── RoomPage.tsx          Poczekalnia + chat + start game
    ├── ChessPage.tsx         Plansza szachów + timer + chat + history
    ├── CheckersPage.tsx      Plansza warcabów (analogicznie)
    ├── CharadesPage.tsx      Canvas + zgadywanie + scoreboard
    ├── HistoryPage.tsx       Paginowana historia partii
    └── MyRoomPage.tsx        Aktywny pokój usera albo empty state
```

### Public assets - `client/public/`

```
client/public/
├── locales/
│   ├── en/translation.json   Tłumaczenia angielskie
│   └── pl/translation.json   Tłumaczenia polskie
├── avatars/                  20 obrazków (avatar_1.png ... avatar_20.png)
└── pieces/                   12 plików SVG figur szachowych (wK, wQ, ..., bP)
```

---

## 5. Modele danych (MongoDB)

Baza: `game_platform`. 5 kolekcji.

### User
```
_id              ObjectId
username         string  unique, 3-30 znaków, /^[a-zA-Z0-9_]+$/
email            string  unique, lowercase
passwordHash     string  (opcjonalne - puste dla kont Google)
googleId         string  (opcjonalne, sparse index)
isGuest          boolean (zwykle false - goście NIE są zapisywani)
friends          ObjectId[]  (referencje do innych Userów)
activeRoomCode   string|null
avatarPreset     string  (np. "color:1" lub "img:avatar_5.png")
lastUsernameChange  Date  (do sprawdzania cooldownu 7 dni)
createdAt/updatedAt
```

### Room
```
_id              ObjectId
code             string  unique (6 znaków, nanoid uppercase)
gameType         "chess" | "checkers" | "charades"
isPublic         boolean
host             ObjectId|null  (User._id; null dla pokojów hostowanych przez gościa)
players          [{ userId, guestId, displayName, socketId, avatarPreset }]
maxPlayers       number  (2 dla chess/checkers, 2-12 dla charades)
status           "waiting" | "host_away" | "in_progress" | "finished"
timerMinutes     number  (zegar partii)
rounds           number  (kalambury)
drawingTime      number  (kalambury, sekundy/runda)
hostDisconnectedAt   Date|null  (start countdownu HOST_AWAY_TTL)
disconnectedPlayers  [{ userId|guestId, displayName, disconnectedAt, expiresIn }]
createdAt/updatedAt
```

### Game (historia)
```
_id              ObjectId
roomId           ObjectId  (referencja do Room)
gameType         "chess" | "checkers" | "charades"
players          [{ userId, displayName }]
winner           ObjectId|null  (User._id zwycięzcy lub null przy remisie/wygranej gościa)
result           "white" | "black" | "draw" | null
moves            string[]  (chess/checkers - notacja)
scores           [{ userId, displayName, points }]  (charades)
duration         number  (sekundy)
finishedAt       Date
createdAt
```

### Message
```
type             "direct" | "room"
roomId           ObjectId  (dla type=room)
from             ObjectId  (User._id; goście nie wysyłają DM)
to               ObjectId  (dla type=direct)
content          string  (max 1000 znaków)
createdAt
```

### FriendRequest
```
from             ObjectId
to               ObjectId
status           "pending" | "accepted" | "rejected"
createdAt
```
Indeks unique na (from, to) - jedno zaproszenie na parę.

---

## 6. API REST

Wszystkie endpointy mają prefiks `/api`. Format danych: JSON. Auth: Bearer JWT
w nagłówku `Authorization`. Walidacja: Zod (gdzie wskazane).

| Metoda | Ścieżka | Auth | Opis |
|---|---|---|---|
| GET  | `/api/health`                     | -    | Health check |
| POST | `/api/auth/register`              | -    | Rejestracja (Zod: username, email, password ≥ 6) |
| POST | `/api/auth/login`                 | -    | Logowanie email/hasło |
| POST | `/api/auth/guest`                 | -    | Tworzy efemeryczne konto gościa |
| GET  | `/api/auth/me`                    | Auth | Dane zalogowanego (lub gościa) |
| GET  | `/api/auth/google`                | -    | Start Google OAuth (redirect) |
| GET  | `/api/auth/google/callback`       | -    | Callback OAuth (redirect na /auth/callback?token=) |
| GET  | `/api/users/me/active-room`       | Auth | Aktywny pokój usera (auto-redirect logic) |
| PUT  | `/api/users/me/avatar`            | Auth (!guest) | Zmiana awatara (regex preset) |
| PUT  | `/api/users/me/password`          | Auth (!guest) | Zmiana hasła (z weryfikacją obecnego) |
| PUT  | `/api/users/me/username`          | Auth (!guest) | Zmiana username (raz/7 dni) |
| GET  | `/api/users/search?q=...`         | Auth | Wyszukiwanie userów (min 2 znaki, max 10 wyników) |
| GET  | `/api/users/:id`                  | Auth | Publiczny profil (username, createdAt) |
| GET  | `/api/friends`                    | Auth | Lista znajomych z populacją |
| POST | `/api/friends/request`            | Auth (!guest) | Wysłanie zaproszenia po username |
| GET  | `/api/friends/requests`           | Auth | Pending'i przychodzące |
| POST | `/api/friends/accept/:requestId`  | Auth | Akceptacja - dodaje do friends[] obu userów |
| POST | `/api/friends/reject/:requestId`  | Auth | Odrzucenie (status=rejected) |
| DELETE | `/api/friends/:friendId`        | Auth | Usunięcie znajomego (z obu list) |
| GET  | `/api/rooms?gameType=chess`       | Auth | Publiczne pokoje typu (max 50, sortowane od najnowszych) |
| GET  | `/api/rooms/:code`                | Auth | Szczegóły pokoju po kodzie |
| GET  | `/api/games/history?page=1&limit=20` | Auth | Paginowana historia (goście dostają puste) |
| GET  | `/api/games/:id`                  | Auth | Szczegóły jednej partii |

---

## 7. Eventy Socket.io

Połączenie wymaga JWT w `auth.token` przy handshake. Konwencja nazewnicza:
`{domena}:{akcja}`. Eventy podzielone tematycznie.

### Klient → serwer

#### Lobby i pokój
- `lobby:join` `{ gameType }` - subskrypcja listy pokojów typu
- `lobby:leave` `{ gameType }` - wypisanie z listy
- `room:create` `{ gameType, isPublic, maxPlayers, timerMinutes, rounds, drawingTime }` - tworzy pokój
- `room:join` `{ code }` - dołączenie (3 ścieżki: powrót hosta / reconnect / nowy gracz)
- `room:leave` `{ code }` - świadome opuszczenie (od razu, bez grace period)
- `user:get_active_room` - pyta o aktywny pokój usera

#### Gry
- `game:start` `{ code }` - host startuje grę (tylko on może)
- `chess:get_state` `{ code }` - prosi o snapshot (race-condition fallback)
- `chess:get_moves` `{ code, position }` - lista legalnych ruchów dla figury
- `chess:move` `{ code, from, to, promotion? }` - wykonanie ruchu
- `chess:resign` `{ code }` - poddanie się
- analogicznie `checkers:get_state / get_moves / move / resign`
- `charades:guess` `{ code, text }` - próba zgadnięcia
- `charades:stroke_live` `{ code, points }` - live preview kreski
- `charades:stroke` `{ code, stroke }` - finalna kreska po up
- `charades:clear` `{ code }` - czyszczenie canvasu (drawer)

#### Czat i znajomi
- `chat:room_message` `{ code, text }` - wiadomość w pokoju
- `chat:direct_message` `{ toUserId, text }` - DM
- `chat:get_history` `{ withUserId }` (ack) - 50 ostatnich DM z partnerem
- `friend:get_online` - synchronizacja stanu online

### Serwer → klient

#### Lobby i pokój
- `lobby:rooms` - aktualna lista pokojów
- `lobby:room_created/updated/removed` - zmiany w lobby
- `room:joined` `{ room, you }` - po sukcesie room:join
- `room:joined_in_progress` - gdy dołączamy do trwających kalamburów
- `room:player_joined / player_left` - lista graczy się zmieniła
- `room:host_away` `{ expiresIn }` - host stracił połączenie (countdown 120 s)
- `room:host_returned` `{ hostName }` - host wrócił
- `room:host_changed` `{ newHostSocketId, newHostName }` - promocja nowego hosta
- `room:closed` `{ reason }` - pokój skasowany
- `room:error` `{ message }` - błąd (room not found, full itp.)
- `user:active_room` / `user:active_room_changed` - aktualny aktywny pokój

#### Gry
- `chess:start` - rozpoczęcie partii (board, kolory, timery)
- `chess:state` - pełny snapshot (po reconnect lub get_state)
- `chess:moved` - ruch wykonany (board, turn, timery, san)
- `chess:valid_moves` - lista legalnych pól
- `chess:invalid_move` - serwer odrzucił ruch
- `chess:timer_update` - tick zegara
- `chess:game_over` `{ result, reason }` - mat/pat/walkower/timeout
- analogicznie `checkers:*`
- `charades:start` - początek partii
- `charades:round_start` `{ drawer, timeLeft, ... }` - nowa runda
- `charades:stroke` / `stroke_live` - broadcast kresek
- `charades:guess` - wszystkie zgadywania (w tym chybione)
- `charades:correct_guess` `{ player, points }` - poprawna odpowiedź
- `charades:close_guess` `{ player }` - prawie (Levenshtein <= 2)
- `charades:round_end` - koniec rundy + wyniki
- `charades:timer` `{ timeLeft }` - tick
- `charades:drawer_skipped` - drawer się nie zgłosił
- `charades:game_over` - finalna tabela

#### Presence (rozłączenia)
- `player:disconnected` `{ userId, displayName, expiresIn }` - banner z countdownem
- `player:reconnected` `{ userId }` - usunięcie z bannera
- `player:reconnect_expired` `{ userId }` - upłynął grace period

#### Czat i znajomi
- `chat:room_message` - wiadomość w pokoju
- `chat:direct_message` - przychodzący DM
- `friend:online_status` `{ userId, online }` - zmiana stanu znajomego
- `friend:request_received` - nowe zaproszenie
- `friend:accepted` - zaakceptowano twoje zaproszenie

---

## 8. Sposób komunikacji frontend ↔ backend ↔ baza

### 8.1 Diagram wysokopoziomowy

```
   ┌─────────────────────────┐                                ┌──────────────┐
   │   Klient (przeglądarka) │                                │  MongoDB 7   │
   │                         │                                │              │
   │  React + Vite + i18n    │                                │  game_       │
   │  AuthContext / Socket   │                                │  platform    │
   │  ┌────────┐  ┌────────┐ │                                │              │
   │  │ axios  │  │ socket │ │                                │  Users       │
   │  │ (HTTP) │  │ .io    │ │                                │  Rooms       │
   │  └───┬────┘  └───┬────┘ │                                │  Games       │
   │      │           │      │                                │  Messages    │
   └──────┼───────────┼──────┘                                │  Friend...   │
          │ JWT       │ JWT (handshake)                       └──────┬───────┘
          │ REST      │ WS                                           │
          │           │                                              │ Mongoose
   ┌──────┼───────────┼──────┐                                       │
   │      ▼           ▼      │                                       │
   │  Express      Socket.io │                                       │
   │  ┌──────┐    ┌────────┐ │                                       │
   │  │routes│    │handlers│ │  ◄────────────────────────────────────┘
   │  │      │    │ +game  │ │
   │  │ auth │    │ -logic │ │
   │  │users │    │        │ │
   │  │...   │    │+memory │ │
   │  └──────┘    └────────┘ │
   │   Backend (Node 20)     │
   └─────────────────────────┘
```

### 8.2 Przepływ uwierzytelniania

1. Klient wysyła `POST /api/auth/login` (lub `/register`, `/guest`).
2. Serwer tworzy/weryfikuje konto, zwraca JWT z payloadem
   `{ userId, isGuest, guestName?, username? }`.
3. Klient zapisuje token w `localStorage` i wywołuje `connectSocket(token)`.
4. Socket.io ustanawia połączenie z handshake `auth: { token }`.
   `socketAuthMiddleware` weryfikuje token, ustawia `socket.userId`,
   `socket.isGuest`, `socket.displayName`.
5. Każde kolejne żądanie HTTP dostaje nagłówek `Authorization: Bearer <token>`
   przez axios interceptor (lib/api.ts).
6. `authMiddleware` w Express weryfikuje token, dla nie-gości pobiera Usera z bazy.
7. Token wygasa po 7 dniach (JWT_EXPIRES_IN). Wygasły => 401 => axios przekierowuje
   na `/login`, AuthContext czyści stan.

### 8.3 Przepływ HTTP (przykład: zmiana awatara)

```
PUT /api/users/me/avatar
Authorization: Bearer <JWT>
Body: { "preset": "img:avatar_3.png" }
```
1. axios (lib/api.ts) dokleja Bearer.
2. Express middleware: `authMiddleware` weryfikuje token, ładuje Usera.
3. Handler: walidacja regexem ("color:N" albo "img:NAZWA.png"), gdyby gość -> 403.
4. Mongoose: `User.findByIdAndUpdate(..., { avatarPreset })`.
5. Zwrot: nowy `avatarPreset`. Klient: `setUser` w AuthContext.

### 8.4 Przepływ Socket.io (przykład: ruch w szachach)

```
Klient (ChessPage)               Serwer (chessHandler)         MongoDB
   |                                  |                          |
   | --- chess:get_moves ---->        |                          |
   |   { code, position }             |                          |
   |                                  | activeGames.get(code)    |
   |                                  | getValidMoves(...)       |
   |                                  |                          |
   | <--- chess:valid_moves ---       |                          |
   |   { moves: ["e4","d4"] }         |                          |
   |                                  |                          |
   | --- chess:move --------->        |                          |
   |   { code, from, to }             |                          |
   |                                  | isValidMove(...)         |
   |                                  | makeMove(...)            |
   |                                  | state.moves.push(san)    |
   |                                  |                          |
   | <--- chess:moved (broadcast) -   |                          |
   |   { board, turn, san, ... }      |                          |
   |                                  |                          |
   | (po macie/timeoucie)             | endGame(...)             |
   |                                  | Game.create(...)         |
   |                                  | --- INSERT (Mongoose) ---|
   |                                  | pruneOldGames(...)       |
   |                                  | Room.update(status=fin)  |
   |                                  |                          |
   | <--- chess:game_over -----       |                          |
```

Stan trwającej gry jest **w pamięci serwera** (`Map<code, ChessGameState>`),
nie w bazie - zaletą jest szybkość, wadą utrata trwających gier przy restarcie
serwera. Po zakończeniu zapisujemy tylko końcowy rekord w `Game`.

### 8.5 Cykl życia pokoju

```
       room:create
          │
          ▼
    ┌─────────────┐    host_away (host disconnect)    ┌─────────────┐
    │   waiting   │ ────────────────────────────────► │  host_away  │
    │             │ ◄──────────────────────────────── │             │
    └──────┬──────┘    host returns within 120s        └──────┬──────┘
           │                                                  │
           │ host clicks Start                                │ HOST_AWAY_TTL
           │ (game:start)                                     │ expired (120s)
           ▼                                                  │
    ┌─────────────┐                                           │
    │ in_progress │                              promoteNextHost
    │             │                                  │
    └──────┬──────┘                                  ▼
           │                                   ┌─────────────┐
           │ game ends                         │   waiting   │
           │ (mat/pat/timeout/resign/walkover) │  (new host) │
           ▼                                   └─────────────┘
    ┌─────────────┐
    │  finished   │ ─► Room.deleteOne (zwykle)
    │             │    Game.create (historia)
    └─────────────┘
```

### 8.6 Race-condition fix przy starcie gry

Gdy host wciska Start:
1. Serwer ustawia `room.status = 'in_progress'`, tworzy `activeGames[code]`,
   wysyła `chess:start` (lub odpowiedni event) do wszystkich w pokoju.
2. Klient (RoomPage) odbiera event i NAVIGUJE na stronę gry **przekazując dane
   przez router state**: `navigate('/game/chess/:code', { state: data })`.
3. Strona gry (ChessPage) używa tych danych do natychmiastowego renderowania
   planszy w `useEffect` przed ustanowieniem listenerów na własne eventy.
4. Dodatkowo na mountcie wysyła `chess:get_state` jako fallback - gdyby user
   wszedł bez state'a (np. odświeżenie strony).

Bez tego fixa w niektórych warunkach klient wchodzi na stronę gry zanim
ustawi listener `chess:start` - i strona zostaje pusta.

### 8.7 Disconnect / reconnect z 3 grace periods

Plik: `server/src/sockets/presenceHandler.ts`.

Po `socket.on('disconnect')`:
- Sprawdzamy czy user był w aktywnym pokoju.
- **Jeśli pokój status = `in_progress`**: ustaw timeout 20 s
  (`GAME_DISCONNECT_GRACE`). Po wygaśnięciu wywołujemy callback game handlera
  (np. `endGame(io, code, otherColor, 'disconnect')`).
- **Jeśli pokój status = `waiting/host_away` i user jest hostem**: ustaw timeout
  120 s (`HOST_AWAY_TTL`). Status pokoju zmienia się na `host_away`. Po wygaśnięciu
  `promoteNextHost(io, code)` wybiera następnego.
- **Jeśli user nie jest hostem**: timeout 20 s (`LOBBY_NON_HOST_GRACE`),
  po wygaśnięciu user zostaje usunięty z players[].

Po `connection` (reconnect):
- `handleReconnect` szuka pokojów, w których user jest na liście players.
- Anulujemy aktywne timeouty (nie obciążamy walkowerem gracza, który wrócił).
- Aktualizujemy `socketId` w players[] i (dla in_progress) w activeGames.
- Jeśli pokój był `host_away` i user to oryginalny host - przywracamy `waiting`,
  emitujemy `room:host_returned` do reszty.
- Wysyłamy `chess:state` / `checkers:state` z aktualnym stanem partii, żeby
  zsynchronizować klienta.

---

## 9. Uruchomienie projektu

### Opcja A: Docker Compose

Wymagane: Docker Desktop / Docker Engine.

```
docker-compose up --build      # pierwszy raz, buduje obrazy
docker-compose up              # kolejne uruchomienia
docker-compose down            # zatrzymanie
```

Aplikacja:
- Klient: http://localhost:5173
- API:    http://localhost:3001/api
- MongoDB: mongodb://localhost:27018 (port 27018, żeby nie kolidował z lokalną instalacją na 27017)

### Opcja B: lokalnie (3 terminale)

Wymagane: Node.js 20, MongoDB lokalny na porcie 27017.

```
# Terminal 1: MongoDB lokalnie (jeśli nie używasz Dockera)
mongod

# Terminal 2: backend
cd server
cp .env.example .env           # uzupełnij JWT_SECRET, opcjonalnie GOOGLE_*
npm install
npm run dev                    # tsx watch na :3001

# Terminal 3: frontend
cd client
npm install
npm run dev                    # Vite na :5173
```

### Build produkcyjny

```
cd server && npm run build && npm start
cd client && npm run build && npx vite preview
```

### Type check

```
cd server && npx tsc --noEmit
cd client && npx tsc --noEmit
```

### Zmienne środowiskowe (`server/.env`)

| Zmienna | Domyślna | Uwagi |
|---|---|---|
| `PORT` | 3001 | Port serwera HTTP/WS |
| `MONGO_URI` | `mongodb://localhost:27017/game_platform` | W Dockerze: `mongodb://mongo:27017/game_platform` |
| `JWT_SECRET` | dev-secret-change-in-prod | **Koniecznie zmień przed produkcją** |
| `JWT_EXPIRES_IN` | 7d | Format jak w `jsonwebtoken` |
| `CLIENT_URL` | http://localhost:5173 | CORS origin + redirect po Google OAuth |
| `GOOGLE_CLIENT_ID` | "" | Pusty wyłącza logowanie Google |
| `GOOGLE_CLIENT_SECRET` | "" | jw. |
| `NODE_ENV` | development | |

### Zmienne środowiskowe (`client/.env`)

| Zmienna | Domyślna | Uwagi |
|---|---|---|
| `VITE_API_URL` | http://localhost:3001 | Base URL dla axios |
| `VITE_SOCKET_URL` | http://localhost:3001 | URL dla socket.io-client (zwykle ten sam co API) |

---

## 10. Mapa decyzji projektowych

- **Stan trwających gier w pamięci, nie w bazie** - prostota i szybkość.
  Cena: restart serwera kasuje rozgrywki. W projekcie studenckim akceptowalne.
- **Goście bez wpisów w bazie** - JWT z prefixem `guest_<id>`, in-memory mapa
  `guestActiveRooms`. Goście nie mają znajomych ani historii - to świadome ograniczenie.
- **JWT w localStorage, nie w cookie** - prostota, brak CSRF, ale teoretycznie
  podatne na XSS. Akceptowalne w kontekście projektu studenckiego.
- **Custom silniki gier** - bez bibliotek (chess.js itp.). Cel edukacyjny.
- **Socket.io zamiast czystego WebSocket** - automatyczny reconnect, fallback do
  long-pollingu w środowiskach za proxy.
- **Tailwind + Radix zamiast pełnego frameworka UI** (np. MUI) - lekkość,
  pełna kontrola nad stylami, kompatybilność z customowym design system.
- **Mongoose zamiast SQL** - dynamiczna schema (rounds/scores/moves dla różnych
  typów gier w jednej kolekcji), prosta integracja z Node.

---

Dokument utrzymywany ręcznie. W razie istotnych zmian w kodzie aktualizuj
sekcję 4 (struktura plików), 6 (API REST) i 7 (eventy Socket.io).
