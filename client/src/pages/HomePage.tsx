import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const games = [
  {
    key: 'chess',
    icon: '♞',
    color: '#D4ADFC',
    desc_pl: 'Klasyczne szachy — blitz, rapid, dowolne tempo.',
    desc_en: 'Classic chess — blitz, rapid, any time control.',
    count: '1 240',
  },
  {
    key: 'checkers',
    icon: '◉',
    color: '#BB90E8',
    desc_pl: 'Polskie warcaby 8×8 z wymuszonymi biciem.',
    desc_en: 'Polish draughts 8×8 with forced captures.',
    count: '318',
  },
  {
    key: 'charades',
    icon: '🎨',
    color: '#F0DCFF',
    desc_pl: 'Rysuj i zgaduj — kalambury dla 2-10 graczy.',
    desc_en: 'Draw and guess — pictionary for 2-10 players.',
    count: '842',
  },
];

export function HomePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isPl = i18n.language === 'pl';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32, paddingTop: 8 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 36, marginBottom: 8 }}>{t('home.welcome')}</h1>
        <p style={{ color: 'var(--pr-text-secondary)', fontSize: 16 }}>{t('home.subtitle')}</p>
      </div>

      {/* Game cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {games.map(g => (
          <button
            key={g.key}
            onClick={() => navigate(`/lobby/${g.key}`)}
            style={{
              background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer',
            }}
          >
            <div
              className="pr-card"
              style={{
                position: 'relative', overflow: 'hidden',
                transition: 'transform .15s, border-color .15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)';
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--pr-border-regular)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = 'none';
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--pr-border-subtle)';
              }}
            >
              {/* Background watermark icon */}
              <div style={{
                position: 'absolute', right: -16, top: -16,
                fontSize: 110, opacity: 0.07, color: g.color,
                pointerEvents: 'none', userSelect: 'none',
                lineHeight: 1,
              }}>
                {g.icon}
              </div>

              {/* Icon box */}
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(212,173,252,.12)',
                border: '1px solid var(--pr-border-subtle)',
                fontSize: 24, marginBottom: 16,
              }}>
                {g.icon}
              </div>

              <div style={{ fontFamily: 'var(--font-head)', fontSize: 20, fontWeight: 700, marginBottom: 6, color: 'var(--pr-text-primary)' }}>
                {t(`home.${g.key}`)}
              </div>
              <div style={{ color: 'var(--pr-text-secondary)', fontSize: 13, marginBottom: 18, lineHeight: 1.5 }}>
                {isPl ? g.desc_pl : g.desc_en}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="pr-badge pr-badge-neutral" style={{ fontSize: 11 }}>
                  <span className="pr-dot pr-dot-online" style={{ width: 6, height: 6 }} />
                  {g.count} online
                </span>
                <span style={{ fontSize: 13, fontFamily: 'var(--font-head)', fontWeight: 600, color: 'var(--pr-accent)' }}>
                  {t('lobby.join', 'Graj')} →
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 16 }}>
        {[
          { icon: '♞', label: isPl ? 'Szachy' : 'Chess',         count: '1 240', color: '#D4ADFC' },
          { icon: '◉', label: isPl ? 'Warcaby' : 'Checkers',     count: '318',   color: '#BB90E8' },
          { icon: '🎨', label: isPl ? 'Kalambury' : 'Pictionary', count: '842',   color: '#F0DCFF' },
        ].map(s => (
          <div key={s.label} className="pr-card" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, fontSize: 20,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(212,173,252,.1)', border: '1px solid var(--pr-border-subtle)',
            }}>
              {s.icon}
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-head)', fontSize: 22, fontWeight: 700, color: s.color }}>
                {s.count}
              </div>
              <div style={{ fontSize: 12, color: 'var(--pr-text-muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                {s.label}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
