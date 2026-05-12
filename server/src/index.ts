// Punkt wejścia serwera. Najpierw łączymy się z MongoDB (twardy exit jeśli się nie
// uda), potem opakowujemy aplikację Express w serwer HTTP - to potrzebne, bo
// Socket.io potrzebuje dostępu do tego samego HTTP serwera, na którym działa Express.
import { createServer } from 'http';
import app from './app.js';
import { connectDB } from './config/db.js';
import { setupSocketServer } from './sockets/index.js';
import { env } from './config/env.js';

async function main() {
  await connectDB();

  const httpServer = createServer(app);
  setupSocketServer(httpServer);

  httpServer.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT}`);
    console.log(`Environment: ${env.NODE_ENV}`);
  });
}

main().catch(console.error);
