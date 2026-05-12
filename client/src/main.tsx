// Punkt wejścia aplikacji React. Importuje globalne style (index.css) oraz konfigurację
// i18next (./i18n) zanim wyrenderowany zostanie root, żeby tłumaczenia były dostępne
// od pierwszego renderu. StrictMode pomaga wychwycić błędne efekty w trybie deweloperskim.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
