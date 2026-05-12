// Inicjalizacja polaczenia z MongoDB przez Mongoose.
// Brak polaczenia uznajemy za blad krytyczny i konczymy proces - nie ma sensu
// uruchamiac serwera bez bazy danych.
import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDB() {
  try {
    await mongoose.connect(env.MONGO_URI);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    // Twardy exit - bez bazy aplikacja nie zadziala, lepiej zrestartowac kontener.
    process.exit(1);
  }
}
