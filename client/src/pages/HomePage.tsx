

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, LogIn, ArrowRight, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { CreateRoomDialog } from "@/components/room/CreateRoomDialog";
import { JoinByCodeDialog } from "@/components/room/JoinByCodeDialog";
import { ActiveRoomCard } from "@/components/dashboard/ActiveRoomCard";
import { RecentMatches } from "@/components/dashboard/RecentMatches";
import type { GameType } from "@/types/room";

interface GameDef {
  key: GameType;
  iconClass: "is-orange" | "is-blue" | "is-green";
  symbol: string;
  pl: string;
  en: string;
  descPl: string;
  descEn: string;
}

const GAMES: GameDef[] = [
  {
    key: "chess",
    iconClass: "is-orange",
    symbol: "♞",
    pl: "Szachy",
    en: "Chess",
    descPl: "Klasyczne szachy 1 na 1 z zegarem. Blitz, rapid, dowolne tempo.",
    descEn: "Classic 1v1 chess with a clock. Blitz, rapid, any time control.",
  },
  {
    key: "checkers",
    iconClass: "is-blue",
    symbol: "◉",
    pl: "Warcaby",
    en: "Checkers",
    descPl: "Polskie warcaby 8x8 z wymuszonymi biciem.",
    descEn: "Polish draughts 8x8 with forced captures.",
  },
  {
    key: "charades",
    iconClass: "is-green",
    symbol: "🎨",
    pl: "Kalambury",
    en: "Charades",
    descPl: "Rysuj i zgaduj — od 2 do 10 graczy w jednym pokoju.",
    descEn: "Draw and guess — 2 to 10 players in one room.",
  },
];

const STEPS_PL = [
  {
    title: "Wybierz grę",
    desc: "Szachy, warcaby albo kalambury — wybierz swój klimat.",
  },
  {
    title: "Stwórz pokój",
    desc: "Skonfiguruj zegar, liczbę graczy i widoczność pokoju.",
  },
  {
    title: "Udostępnij kod",
    desc: "Wyślij 6-znakowy kod znajomym i zaproś ich do gry.",
  },
  {
    title: "Graj online",
    desc: "Czat w czasie rzeczywistym, zegary, historia ruchów.",
  },
];

const STEPS_EN = [
  {
    title: "Pick a game",
    desc: "Chess, checkers, or charades — pick what suits you.",
  },
  {
    title: "Create a room",
    desc: "Set the clock, max players, and visibility.",
  },
  {
    title: "Share the code",
    desc: "Send the 6-character code to friends and invite them.",
  },
  {
    title: "Play online",
    desc: "Real-time chat, clocks, move history — all in.",
  },
];

export function HomePage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isPl = i18n.language === "pl";

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  const steps = isPl ? STEPS_PL : STEPS_EN;

  const heading = user
    ? `${t("home.dashboard.greeting", "Cześć")}, ${user.username}`
    : "PlayRoom";

  const subtitle = user
    ? t(
        "home.dashboard.subtitle",
        "Wybierz grę albo dołącz do pokoju ze znajomymi.",
      )
    : t(
        "home.hero.subtitle",
        "Platforma do grania online ze znajomymi w szachy, warcaby i kalambury.",
      );

  return (
    <div className={user ? "pr-dashboard" : "pr-landing"}>
      
      <section className={`pr-hero fade-up ${user ? "pr-hero-compact" : ""}`}>
        {!user && (
          <div className="pr-hero-tagline">
            <span className="pr-badge pr-badge-primary">
              <Sparkles size={12} />{" "}
              {t("home.hero.tagline", "Graj online ze znajomymi")}
            </span>
          </div>
        )}

        <h1 className="pr-hero-title">{heading}</h1>
        <p className="pr-hero-subtitle">{subtitle}</p>

        <div className="pr-cta-row">
          <button
            className={`pr-btn pr-btn-primary ${user ? "" : "pr-btn-lg"}`}
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={user ? 15 : 18} />
            {t("home.hero.ctaCreate", "Stwórz pokój")}
          </button>
          <button
            className={`pr-btn pr-btn-secondary ${user ? "" : "pr-btn-lg"}`}
            onClick={() => setJoinOpen(true)}
          >
            <LogIn size={user ? 15 : 18} />
            {t("home.hero.ctaJoin", "Dołącz do pokoju")}
          </button>
        </div>
      </section>

      
      {user && user.activeRoomCode && (
        <section className="pr-section fade-up" style={{ paddingTop: 12 }}>
          <ActiveRoomCard code={user.activeRoomCode} />
        </section>
      )}

      
      <section className="pr-section">
        <h2 className="pr-section-title">
          {t("home.games.title", "Wybierz grę")}
        </h2>
        {!user && (
          <p className="pr-section-sub">
            {t(
              "home.games.sub",
              "Trzy gry, jeden pokój — wybierz swój klimat.",
            )}
          </p>
        )}
        <div className="pr-games-grid fade-up-stagger">
          {GAMES.map((g) => (
            <Link key={g.key} to={`/lobby/${g.key}`} className="pr-game-card">
              <div className={`pr-game-card-icon ${g.iconClass}`}>
                {g.symbol}
              </div>
              <div className="pr-game-card-title">{isPl ? g.pl : g.en}</div>
              <div className="pr-game-card-desc">
                {isPl ? g.descPl : g.descEn}
              </div>
              <div className="pr-game-card-cta">
                {t("lobby.join", "Graj")}
                <ArrowRight size={15} />
              </div>
            </Link>
          ))}
        </div>
      </section>

      
      {!user && (
        <section className="pr-section">
          <h2 className="pr-section-title">
            {t("home.howItWorks.title", "Jak to działa")}
          </h2>
          <p className="pr-section-sub">
            {t(
              "home.howItWorks.sub",
              "Cztery proste kroki dzielą Cię od pierwszej partii.",
            )}
          </p>
          <div className="pr-steps-grid fade-up-stagger">
            {steps.map((s, i) => (
              <div key={i} className="pr-step">
                <div className="pr-step-num">{i + 1}</div>
                <div className="pr-step-title">{s.title}</div>
                <div className="pr-step-desc">{s.desc}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      
      {user && !user.isGuest && (
        <section className="pr-section">
          <h2 className="pr-section-title">
            {t("home.dashboard.recent", "Ostatnie partie")}
          </h2>
          <RecentMatches limit={5} />
        </section>
      )}

      
      {!user && (
        <footer className="pr-footer">
          <div
            className="pr-container"
            style={{
              display: "flex",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 14,
            }}
          >
            <span>PlayRoom · 2026</span>
            <div style={{ display: "flex", gap: 18 }}>
              <button
                onClick={() => navigate("/login")}
                style={{
                  background: "none",
                  border: "none",
                  color: "inherit",
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                {t("nav.login", "Logowanie")}
              </button>
              <button
                onClick={() => navigate("/register")}
                style={{
                  background: "none",
                  border: "none",
                  color: "inherit",
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                {t("nav.register", "Rejestracja")}
              </button>
            </div>
          </div>
        </footer>
      )}

      <CreateRoomDialog open={createOpen} onOpenChange={setCreateOpen} />
      <JoinByCodeDialog open={joinOpen} onOpenChange={setJoinOpen} />
    </div>
  );
}
