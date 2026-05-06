import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X, UserPlus, Check, Trash2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { avatarClass, avatarImgSrc, avatarClassFromId } from '@/lib/avatar';
import { RecentMatches } from '@/components/dashboard/RecentMatches';
import type { Friend, FriendRequest } from '@/types/user';
import type { GameHistory, GameHistoryResponse } from '@/types/game';

// ─── Avatar presets ──────────────────────────────────────────────────────────

const COLOR_PRESETS = ['color:1', 'color:2', 'color:3', 'color:4', 'color:5', 'color:6', 'color:7', 'color:8'];
// Dodaj pliki PNG/JPG do client/public/avatars/ i wpisz ich nazwy tutaj w formacie 'img:nazwa.png'
const IMAGE_PRESETS: string[] = [
  'img:avatar_1.png', 'img:avatar_2.png', 'img:avatar_3.png', 'img:avatar_4.png',
  'img:avatar_5.png', 'img:avatar_6.png', 'img:avatar_7.png', 'img:avatar_8.png',
  'img:avatar_9.png', 'img:avatar_10.png', 'img:avatar_11.png', 'img:avatar_12.png',
  'img:avatar_13.png', 'img:avatar_14.png', 'img:avatar_15.png', 'img:avatar_16.png',
  'img:avatar_17.png', 'img:avatar_18.png', 'img:avatar_19.png', 'img:avatar_20.png',
];

// ─── Small components ────────────────────────────────────────────────────────

function AvatarDisplay({ preset, size, initials, guestId }: { preset?: string; size: number; initials: string; guestId?: string }) {
  const src = avatarImgSrc(preset);
  const cls = guestId ? avatarClassFromId(guestId) : avatarClass(preset);
  const fontSize = size * 0.35;
  if (src) {
    return (
      <div className={`pr-avatar ${cls}`} style={{ width: size, height: size }}>
        <img src={src} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
      </div>
    );
  }
  return (
    <div className={`pr-avatar ${cls}`} style={{ width: size, height: size, fontSize }}>
      {initials}
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

interface ProfilePanelProps {
  open: boolean;
  onClose: () => void;
}

type Tab = 'profil' | 'znajomi' | 'historia';

export function ProfilePanel({ open, onClose }: ProfilePanelProps) {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('profil');

  // close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open || !user) return null;

  const initials = (user.username || 'G').slice(0, 2).toUpperCase();
  const joinedDate = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString()
    : null;

  return (
    <>
      <div className="pr-profile-backdrop" onClick={onClose} />
      <aside className="pr-profile-panel">
        {/* Header */}
        <div className="pr-profile-header">
          <AvatarDisplay preset={user.avatarPreset} size={52} initials={initials} guestId={user.isGuest ? user.id : undefined} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 17, color: 'var(--pr-light)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.username}
            </div>
            {user.email && (
              <div style={{ fontSize: 12, color: 'var(--pr-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.email}
              </div>
            )}
            {joinedDate && (
              <div style={{ fontSize: 11, color: 'var(--pr-text-muted)', marginTop: 2 }}>
                {t('profile.memberSince', { date: joinedDate })}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--pr-text-muted)', padding: 4, borderRadius: 8, lineHeight: 0 }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="pr-tabs" style={{ flexShrink: 0, padding: '0 24px' }}>
          {(['profil', 'znajomi', 'historia'] as Tab[]).map(t_ => (
            <button
              key={t_}
              className={`pr-tab ${tab === t_ ? 'active' : ''}`}
              onClick={() => setTab(t_)}
            >
              {t_ === 'profil' ? t('profile.tabs.profile') : t_ === 'znajomi' ? t('profile.tabs.friends') : t('profile.tabs.history')}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="pr-profile-body">
          {tab === 'profil' && (
            <ProfilTab
              user={user}
              initials={initials}
              onAvatarChange={(preset) => updateUser({ avatarPreset: preset })}
              onUsernameChange={(username, lastUsernameChange) => updateUser({ username, lastUsernameChange })}
            />
          )}
          {tab === 'znajomi' && <ZnajomiTab />}
          {tab === 'historia' && (
            <div className="pr-profile-section">
              {user.isGuest ? (
                <div style={{ textAlign: 'center', color: 'var(--pr-text-muted)', padding: '32px 0' }}>
                  {t('profile.historyUnavailable')}
                </div>
              ) : (
                <>
                  <RecentMatches limit={5} onNavigate={() => { navigate('/history'); onClose(); }} />
                </>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

// ─── Profil Tab ───────────────────────────────────────────────────────────────

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function useCountdown(lastChange?: string | null) {
  const getRemaining = () => {
    if (!lastChange) return 0;
    const elapsed = Date.now() - new Date(lastChange).getTime();
    return Math.max(0, WEEK_MS - elapsed);
  };
  const [remaining, setRemaining] = useState(getRemaining);
  useEffect(() => {
    if (!lastChange) return;
    const id = setInterval(() => setRemaining(getRemaining()), 60_000);
    return () => clearInterval(id);
  }, [lastChange]);
  return remaining;
}

function formatRemaining(ms: number) {
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function ProfilTab({
  user,
  initials,
  onAvatarChange,
  onUsernameChange,
}: {
  user: { avatarPreset?: string; isGuest: boolean; id: string; username?: string; lastUsernameChange?: string | null };
  initials: string;
  onAvatarChange: (preset: string) => void;
  onUsernameChange: (username: string, lastUsernameChange: string) => void;
}) {
  const { t } = useTranslation();
  type GameStats = { total: number; won: number; lost: number; drew: number };
  const [stats, setStats] = useState<{ overall: GameStats; byType: Record<string, GameStats> } | null>(null);
  const [statTab, setStatTab] = useState<'all' | 'chess' | 'checkers' | 'charades'>('all');
  const [selectedPreset, setSelectedPreset] = useState(user.avatarPreset || 'color:1');
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwShow, setPwShow] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingPw, setSavingPw] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [unMsg, setUnMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingUn, setSavingUn] = useState(false);
  const remaining = useCountdown(user.lastUsernameChange);
  const canChangeUsername = remaining === 0;

  // Fetch stats
  useEffect(() => {
    if (user.isGuest) return;
    api.get<GameHistoryResponse>('/games/history?page=1&limit=100')
      .then(res => {
        const games: GameHistory[] = res.data.games;
        const empty = (): GameStats => ({ total: 0, won: 0, lost: 0, drew: 0 });
        const overall = empty();
        const byType: Record<string, GameStats> = {};

        for (const g of games) {
          if (!byType[g.gameType]) byType[g.gameType] = empty();
          overall.total++;
          byType[g.gameType].total++;

          let outcome: 'won' | 'lost' | 'drew';
          if (g.gameType === 'charades') {
            const myScore = g.scores?.find(s => s.userId === user.id);
            const maxScore = Math.max(...(g.scores?.map(s => s.points) ?? [0]));
            outcome = myScore && myScore.points === maxScore ? 'won' : 'lost';
          } else {
            outcome = g.result === 'draw' ? 'drew' : g.winner === user.id ? 'won' : 'lost';
          }
          overall[outcome]++;
          byType[g.gameType][outcome]++;
        }
        setStats({ overall, byType });
      })
      .catch(() => {});
  }, [user.isGuest, user.id]);

  const saveAvatar = async () => {
    if (savingAvatar || selectedPreset === (user.avatarPreset || 'color:1')) return;
    setSavingAvatar(true);
    setAvatarMsg(null);
    try {
      await api.put('/users/me/avatar', { preset: selectedPreset });
      onAvatarChange(selectedPreset);
      setAvatarMsg({ ok: true, text: t('profile.avatarSaved') });
    } catch {
      setAvatarMsg({ ok: false, text: t('profile.avatarError') });
    }
    setSavingAvatar(false);
  };

  const handleUsernameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canChangeUsername) return;
    const trimmed = newUsername.trim();
    if (!trimmed) return;
    setSavingUn(true);
    try {
      const res = await api.put('/users/me/username', { username: trimmed });
      onUsernameChange(res.data.username, res.data.lastUsernameChange);
      setNewUsername('');
      setUnMsg({ ok: true, text: t('profile.usernameChanged') });
    } catch (err: any) {
      setUnMsg({ ok: false, text: err?.response?.data?.error || t('profile.usernameError') });
    }
    setSavingUn(false);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) {
      setPwMsg({ ok: false, text: t('profile.passwordMismatch') }); return;
    }
    if (pwForm.next.length < 6) {
      setPwMsg({ ok: false, text: t('profile.passwordTooShort') }); return;
    }
    setSavingPw(true);
    try {
      await api.put('/users/me/password', { currentPassword: pwForm.current, newPassword: pwForm.next });
      setPwMsg({ ok: true, text: t('profile.passwordChanged') });
      setPwForm({ current: '', next: '', confirm: '' });
    } catch (err: any) {
      setPwMsg({ ok: false, text: err?.response?.data?.error || t('profile.passwordError') });
    }
    setSavingPw(false);
  };

  if (user.isGuest) {
    return (
      <div className="pr-profile-section">
        <div style={{
          background: 'linear-gradient(135deg, rgba(255,106,0,0.12), rgba(0,119,255,0.10))',
          border: '1px solid rgba(255,106,0,0.25)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px 20px',
          textAlign: 'center',
          marginTop: 8,
        }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🎮</div>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 16, color: 'var(--pr-light)', marginBottom: 8 }}>
            {t('profile.unlockTitle')}
          </div>
          <div style={{ fontSize: 13, color: 'var(--pr-text-muted)', marginBottom: 18, lineHeight: 1.5 }}>
            {t('profile.unlockDesc')}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/register" className="pr-btn pr-btn-primary pr-btn-sm" style={{ textDecoration: 'none' }}>
              {t('profile.createAccount')}
            </a>
            <a href="/login" className="pr-btn pr-btn-secondary pr-btn-sm" style={{ textDecoration: 'none' }}>
              {t('auth.login')}
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Avatar picker */}
      <div className="pr-profile-section">
        <div className="pr-profile-section-label">{t('profile.chooseAvatar')}</div>
        <div className="pr-avatar-picker">
          {COLOR_PRESETS.map(preset => {
            const cls = avatarClass(preset);
            const active = selectedPreset === preset;
            return (
              <div
                key={preset}
                className={`pr-avatar-option ${cls} ${active ? 'active' : ''}`}
                onClick={() => setSelectedPreset(preset)}
                title={preset}
              >
                {initials}
              </div>
            );
          })}
          {IMAGE_PRESETS.map(preset => {
            const src = avatarImgSrc(preset)!;
            const active = selectedPreset === preset;
            return (
              <div
                key={preset}
                className={`pr-avatar-option ${active ? 'active' : ''}`}
                onClick={() => setSelectedPreset(preset)}
                style={{ padding: 0 }}
              >
                <img
                  src={src}
                  alt={preset}
                  onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }}
                />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <button
            className="pr-btn pr-btn-primary pr-btn-sm"
            onClick={saveAvatar}
            disabled={savingAvatar || selectedPreset === (user.avatarPreset || 'color:1')}
            style={{ opacity: selectedPreset === (user.avatarPreset || 'color:1') ? 0.5 : 1 }}
          >
            {savingAvatar ? t('profile.saving') : t('profile.saveAvatar')}
          </button>
          {avatarMsg && (
            <span style={{ fontSize: 13, color: avatarMsg.ok ? 'var(--pr-accent)' : '#FCA5A5' }}>
              {avatarMsg.text}
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      {!user.isGuest && stats && (() => {
        const TABS: { key: 'all' | 'chess' | 'checkers' | 'charades'; icon: string; label: string }[] = [
          { key: 'all',      icon: '🎮', label: t('profile.stats.all') },
          { key: 'chess',    icon: '♞',  label: t('home.chess') },
          { key: 'checkers', icon: '◉',  label: t('home.checkers') },
          { key: 'charades', icon: '🎨', label: t('home.charades') },
        ];
        const visibleTabs = TABS.filter(tab => tab.key === 'all' || (stats.byType[tab.key]?.total ?? 0) > 0);
        const activeData = statTab === 'all' ? stats.overall : (stats.byType[statTab] ?? stats.overall);
        return (
          <div className="pr-profile-section">
            <div className="pr-profile-section-label">{t('profile.stats.title')}</div>
            {/* Tab pills */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              {visibleTabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setStatTab(tab.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '4px 12px', borderRadius: 20, fontSize: 13,
                    fontFamily: 'var(--font-head)', fontWeight: 600, cursor: 'pointer',
                    border: statTab === tab.key ? '1px solid var(--pr-primary)' : '1px solid var(--pr-border-dark)',
                    background: statTab === tab.key ? 'rgba(255,106,0,0.15)' : 'rgba(255,247,232,0.04)',
                    color: statTab === tab.key ? 'var(--pr-primary)' : 'var(--pr-text-muted)',
                    transition: 'all .15s',
                  }}
                >
                  <span>{tab.icon}</span>{tab.label}
                </button>
              ))}
            </div>
            {/* 4-box grid */}
            <div className="pr-stat-grid">
              <div className="pr-stat-box">
                <div className="pr-stat-num">{activeData.total}</div>
                <div className="pr-stat-label">{t('profile.stats.total')}</div>
              </div>
              <div className="pr-stat-box">
                <div className="pr-stat-num" style={{ color: 'var(--pr-accent)' }}>{activeData.won}</div>
                <div className="pr-stat-label">{t('profile.stats.won')}</div>
              </div>
              <div className="pr-stat-box">
                <div className="pr-stat-num" style={{ color: 'var(--pr-primary)' }}>{activeData.lost}</div>
                <div className="pr-stat-label">{t('profile.stats.lost')}</div>
              </div>
              <div className="pr-stat-box">
                <div className="pr-stat-num" style={{ color: '#FFD66B' }}>{activeData.drew}</div>
                <div className="pr-stat-label">{t('profile.stats.drew')}</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Username change */}
      {!user.isGuest && (
        <div className="pr-profile-section">
          <div className="pr-profile-section-label">{t('profile.changeUsername')}</div>
          <div style={{ fontSize: 12, color: 'var(--pr-text-muted)', marginBottom: 8 }}>
            {t('profile.usernameLimit')}
          </div>
          <form onSubmit={handleUsernameSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              className="pr-input"
              placeholder={t('profile.currentUsername', { username: user.username || '' })}
              value={newUsername}
              onChange={e => { setNewUsername(e.target.value); setUnMsg(null); }}
              disabled={!canChangeUsername}
              minLength={3}
              maxLength={30}
              pattern="[a-zA-Z0-9_]+"
              style={{ width: '100%', opacity: canChangeUsername ? 1 : 0.5 }}
            />
            {unMsg && (
              <div style={{ fontSize: 13, color: unMsg.ok ? 'var(--pr-accent)' : '#FCA5A5' }}>
                {unMsg.text}
              </div>
            )}
            <button
              type="submit"
              className="pr-btn pr-btn-primary pr-btn-sm"
              disabled={savingUn || !canChangeUsername}
              style={{ alignSelf: 'flex-start', marginTop: 4, opacity: canChangeUsername ? 1 : 0.7 }}
            >
              {savingUn
                ? t('profile.saving')
                : !canChangeUsername
                  ? t('profile.changeIn', { time: formatRemaining(remaining) })
                  : t('profile.changeUsername')}
            </button>
          </form>
        </div>
      )}

      {/* Password change */}
      {!user.isGuest && (
        <div className="pr-profile-section">
          <div className="pr-profile-section-label">{t('profile.changePassword')}</div>
          <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ position: 'relative' }}>
              <input
                className="pr-input"
                type={pwShow ? 'text' : 'password'}
                placeholder={t('profile.currentPassword')}
                value={pwForm.current}
                onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))}
                style={{ width: '100%' }}
              />
              <button
                type="button"
                onClick={() => setPwShow(s => !s)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--pr-text-muted)', lineHeight: 0 }}
              >
                {pwShow ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <input
              className="pr-input"
              type={pwShow ? 'text' : 'password'}
              placeholder={t('profile.newPassword')}
              value={pwForm.next}
              onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))}
              style={{ width: '100%' }}
            />
            <input
              className="pr-input"
              type={pwShow ? 'text' : 'password'}
              placeholder={t('profile.confirmNewPassword')}
              value={pwForm.confirm}
              onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
              style={{ width: '100%' }}
            />
            {pwMsg && (
              <div style={{ fontSize: 13, color: pwMsg.ok ? 'var(--pr-accent)' : '#FCA5A5', padding: '4px 0' }}>
                {pwMsg.text}
              </div>
            )}
            <button
              type="submit"
              className="pr-btn pr-btn-primary pr-btn-sm"
              disabled={savingPw}
              style={{ alignSelf: 'flex-start', marginTop: 4 }}
            >
              {savingPw ? t('profile.saving') : t('profile.changePassword')}
            </button>
          </form>
        </div>
      )}
    </>
  );
}

// ─── Znajomi Tab ──────────────────────────────────────────────────────────────

function ZnajomiTab() {
  const { t } = useTranslation();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [addInput, setAddInput] = useState('');
  const [addMsg, setAddMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<Friend[]>('/friends'),
      api.get<FriendRequest[]>('/friends/requests'),
    ]).then(([fr, rq]) => {
      setFriends(fr.data);
      setRequests(rq.data);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const username = addInput.trim();
    if (!username) return;
    try {
      await api.post('/friends/request', { username });
      setAddMsg({ ok: true, text: t('profile.inviteSent', { username }) });
      setAddInput('');
    } catch (err: any) {
      setAddMsg({ ok: false, text: err?.response?.data?.error || t('profile.inviteError') });
    }
    setTimeout(() => setAddMsg(null), 4000);
  };

  const handleAccept = async (id: string) => {
    await api.post(`/friends/accept/${id}`).catch(() => {});
    load();
  };

  const handleReject = async (id: string) => {
    await api.post(`/friends/reject/${id}`).catch(() => {});
    load();
  };

  const handleRemove = async (id: string) => {
    await api.delete(`/friends/${id}`).catch(() => {});
    setFriends(prev => prev.filter(f => f._id !== id));
  };

  if (loading) {
    return <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--pr-text-muted)' }}>{t('app.loading')}</div>;
  }

  return (
    <>
      {/* Add friend */}
      <div className="pr-profile-section">
        <div style={{ fontSize: 11, color: 'var(--pr-text-muted)'}} className="pr-profile-section-label">{t('profile.addFriend')}</div>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            className="pr-input"
            placeholder={t('auth.username')}
            value={addInput}
            onChange={e => setAddInput(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" className="pr-btn pr-btn-primary pr-btn-sm" style={{ height: 44, flexShrink: 0 }}>
            <UserPlus size={15} />
          </button>
        </form>
        {addMsg && (
          <div style={{ fontSize: 13, marginTop: 6, color: addMsg.ok ? 'var(--pr-accent)' : '#FCA5A5' }}>
            {addMsg.text}
          </div>
        )}
      </div>

      {/* Pending requests */}
      {requests.length > 0 && (
        <div className="pr-profile-section">
          <div className="pr-profile-section-label">{t('profile.requestsCount', { count: requests.length })}</div>
          {requests.map(rq => (
            <div key={rq._id} className="pr-friend-row">
              <AvatarDisplay preset={rq.from.avatarPreset} size={34} initials={rq.from.username.slice(0, 2).toUpperCase()} />
              <div style={{ flex: 1, fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 14, color: 'var(--pr-light)' }}>
                {rq.from.username}
              </div>
              <button
                className="pr-btn pr-btn-sm"
                style={{ background: 'rgba(126,211,33,.15)', border: '1px solid rgba(126,211,33,.3)', color: 'var(--pr-accent)', padding: '4px 10px' }}
                onClick={() => handleAccept(rq._id)}
              >
                <Check size={14} />
              </button>
              <button
                className="pr-btn pr-btn-sm"
                style={{ background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.3)', color: '#FCA5A5', padding: '4px 10px' }}
                onClick={() => handleReject(rq._id)}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Friends list */}
      <div className="pr-profile-section">
        <div className="pr-profile-section-label">
          <div style={{ fontSize: 12, color: 'var(--pr-text-muted)' }}>
            {t('profile.friendsCount', { count: friends.length })}
          </div>
        </div>
        {friends.length === 0 ? (
          <div style={{ color: 'var(--pr-text-muted)', fontSize: 13, padding: '12px 0' }}>
            {t('profile.noFriends')}
          </div>
        ) : (
          friends.map(f => (
            <div key={f._id} className="pr-friend-row">
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <AvatarDisplay preset={f.avatarPreset} size={34} initials={f.username.slice(0, 2).toUpperCase()} />
                <span
                  className={`pr-dot ${f.online ? 'pr-dot-online' : ''}`}
                  style={{ position: 'absolute', bottom: 0, right: 0, width: 8, height: 8, border: '1.5px solid var(--pr-surface)' }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 14, color: 'var(--pr-light)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.username}
                </div>
                <div style={{ fontSize: 11, color: f.online ? 'var(--pr-accent)' : 'var(--pr-text-muted)' }}>
                  {f.online ? t('friends.online') : t('friends.offline')}
                </div>
              </div>
              <button
                className="pr-btn pr-btn-sm"
                style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', color: '#FCA5A5', padding: '4px 10px', flexShrink: 0 }}
                onClick={() => handleRemove(f._id)}
                title={t('profile.removeFriend')}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}