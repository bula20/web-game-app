// Klient HTTP (axios) do wywoływania REST API serwera. Dwa interceptory:
//   - request: dokleja nagłówek Authorization z tokenem JWT z localStorage,
//   - response: na 401 (token wygasł lub nieprawidłowy) czyści token
//     i wymusza powrót na /login.
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
});

// Każde żądanie automatycznie dostaje Bearer token, jeśli użytkownik jest zalogowany.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Globalna obsługa wygasłej sesji - przeładowanie strony przy 401 czyści cały stan
// React (AuthContext, SocketContext) i pokazuje formularz logowania.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
