# PlayRoom

An online multiplayer game platform featuring Chess, Checkers, and Charades. Play with friends in real time — create a room, share the code, and start playing.

## Features

- **3 games** — Chess, Checkers, Charades (draw & guess)
- **Real-time multiplayer** via Socket.io
- **Room system** — create public or private rooms with a 6-character code
- **Authentication** — register with email, log in with Google, or play as a guest
- **Friends system** — add friends, see who's online, chat
- **Game history** — track your results and stats
- **Bilingual** — Polish and English (i18n)
- **Fully responsive** — works on desktop and mobile

## Tech Stack

**Client**
- React 19 + TypeScript
- Vite 8
- Tailwind CSS v4
- Socket.io-client
- i18next (PL/EN)
- React Router v7

**Server**
- Node.js + Express
- Socket.io
- MongoDB + Mongoose
- JWT authentication
- Passport.js (Google OAuth 2.0)
- TypeScript + tsup

## Local Development

### Prerequisites

- Node.js 22.12+ or Docker

### With Docker (recommended)

```bash
cp .env.example .env
# Fill in the values in .env
docker compose up
```

App will be available at `http://localhost:5173`.

### Without Docker

1. Start MongoDB locally (or use MongoDB Atlas)

2. Install and start the server:
```bash
cd server
npm install
npm run dev
```

3. Install and start the client:
```bash
cd client
npm install
npm run dev
```

### Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Description |
|---|---|
| `PORT` | Server port (default: `3001`) |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret key for JWT tokens |
| `CLIENT_URL` | Frontend URL (e.g. `http://localhost:5173`) |
| `SERVER_URL` | Backend URL (e.g. `http://localhost:3001`) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (optional) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret (optional) |

For the client, create `client/.env.local`:

```env
VITE_API_URL=http://localhost:3001
VITE_SOCKET_URL=http://localhost:3001
```

## Deployment

The app is designed to be split across two services:

- **Client** → [Vercel](https://vercel.com) (set `VITE_API_URL` and `VITE_SOCKET_URL` to your server URL)
- **Server** → [Railway](https://railway.app) (set all variables from `.env.example` + `SERVER_URL` and `CLIENT_URL`)
- **Database** → [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) (free tier)

## Project Structure

```
web-game-app/
├── client/          # React frontend
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── context/
│   │   └── lib/
│   └── public/
│       └── locales/ # i18n translations (pl, en)
├── server/          # Express backend
│   └── src/
│       ├── config/
│       ├── middleware/
│       ├── models/
│       ├── routes/
│       └── sockets/
└── docker-compose.yml
```

## License

MIT
