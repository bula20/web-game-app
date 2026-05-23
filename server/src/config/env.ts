// Centralne miejsce konfiguracji aplikacji - ladowanie zmiennych srodowiskowych z pliku .env
// i udostepnianie ich pozostalym modulom z bezpiecznymi wartosciami domyslnymi dla developmentu.
import dotenv from 'dotenv';
dotenv.config();

// Wartosci fallback pozwalaja uruchomic serwer lokalnie bez .env, ale w produkcji
// nalezy nadpisac przynajmniej JWT_SECRET i MONGO_URI.
export const env = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/game_platform',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-in-prod',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  // Puste GOOGLE_CLIENT_* wylacza logowanie przez Google (passport.ts pomija strategie).
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  SERVER_URL: process.env.SERVER_URL || 'http://localhost:3001',
  NODE_ENV: process.env.NODE_ENV || 'development',
};
