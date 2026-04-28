import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { useSocket } from '@/context/SocketContext';
import { Search, UserPlus, Send, ArrowLeft, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import type { Friend, FriendRequest } from '@/types/user';

type DmMessage = { from: string; fromId: string; text: string; timestamp: string };

export function Sidebar() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { socket } = useSocket();

  const [tab, setTab] = useState<'friends' | 'dm'>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [addUsername, setAddUsername] = useState('');
  const [query, setQuery] = useState('');
  const [chatWith, setChatWith] = useState<Friend | null>(null);
  const [chatMessages, setChatMessages] = useState<DmMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    if (!user || user.isGuest) return;
    loadFriends();
    loadRequests();
  }, [user]);

  useEffect(() => {
    if (!socket) return;
    socket.on('friend:online_status', ({ userId, online }: { userId: string; online: boolean }) => {
      setFriends(prev => prev.map(f => f._id === userId ? { ...f, online } : f));
    });
    socket.on('friend:request_received', () => loadRequests());
    socket.on('friend:accepted', () => loadFriends());
    socket.on('chat:direct_message', (msg: DmMessage) => {
      if (chatWith && msg.fromId === chatWith._id) {
        setChatMessages(prev => [...prev, msg]);
      }
    });
    return () => {
      socket.off('friend:online_status');
      socket.off('friend:request_received');
      socket.off('friend:accepted');
      socket.off('chat:direct_message');
    };
  }, [socket, chatWith]);

  const loadFriends = async () => {
    try { const r = await api.get('/friends'); setFriends(r.data); } catch { /* ignore */ }
  };
  const loadRequests = async () => {
    try { const r = await api.get('/friends/requests'); setRequests(r.data); } catch { /* ignore */ }
  };

  const handleAddFriend = async () => {
    if (!addUsername.trim()) return;
    try {
      await api.post('/friends/request', { username: addUsername.trim() });
      toast.success(t('friends.requestSent', { username: addUsername.trim() }));
      setAddUsername('');
    } catch { toast.error(t('friends.requestFailed')); }
  };

  const handleAccept = async (id: string) => {
    try { await api.post(`/friends/accept/${id}`); loadFriends(); loadRequests(); } catch { /* ignore */ }
  };
  const handleReject = async (id: string) => {
    try { await api.post(`/friends/reject/${id}`); loadRequests(); } catch { /* ignore */ }
  };

  const openChat = (friend: Friend) => {
    setChatWith(friend);
    setChatMessages([]);
    setTab('dm');
    if (socket) {
      socket.emit('chat:get_history', { withUserId: friend._id }, (messages: any[]) => {
        setChatMessages(messages.map(m => ({
          from: m.from === user?.id ? user.username : friend.username,
          fromId: m.from,
          text: m.content,
          timestamp: m.createdAt,
        })));
      });
    }
  };

  const sendMessage = () => {
    if (!messageText.trim() || !socket || !chatWith) return;
    socket.emit('chat:direct_message', { toUserId: chatWith._id, text: messageText.trim() });
    setChatMessages(prev => [...prev, {
      from: user?.username || '',
      fromId: user?.id || '',
      text: messageText.trim(),
      timestamp: new Date().toISOString(),
    }]);
    setMessageText('');
  };

  if (!user || user.isGuest) return null;

  const online = friends.filter(f => f.online);
  const offline = friends.filter(f => !f.online);
  const filtered = (arr: Friend[]) => arr.filter(f => f.username.toLowerCase().includes(query.toLowerCase()));
  const unreadCount = requests.length;

  return (
    <aside className="pr-sidebar">
      {/* Tab switcher */}
      <div className="pr-sidebar-header">
        <div className="pr-tabs" style={{ width: '100%' }}>
          <button
            className={`pr-tab ${tab === 'friends' ? 'active' : ''}`}
            style={{ flex: 1 }}
            onClick={() => setTab('friends')}
          >
            {t('friends.title', 'Znajomi')}
            {unreadCount > 0 && (
              <span style={{
                marginLeft: 6, background: 'var(--pr-accent)', color: '#1A0B2E',
                fontSize: 10, padding: '1px 5px', borderRadius: 999, fontWeight: 700,
              }}>{unreadCount}</span>
            )}
          </button>
          <button
            className={`pr-tab ${tab === 'dm' ? 'active' : ''}`}
            style={{ flex: 1 }}
            onClick={() => { setTab('dm'); if (!chatWith && friends.length > 0) setChatWith(null); }}
          >
            {t('friends.dm', 'Wiadomości')}
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ padding: '10px 12px 6px', position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 24, top: '50%', transform: 'translateY(-50%)', color: 'var(--pr-text-muted)', pointerEvents: 'none' }} />
        <input
          className="pr-input"
          style={{ height: 34, paddingLeft: 36, fontSize: 13 }}
          placeholder={t('friends.search', 'Szukaj znajomych…')}
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 8px' }}>
        {/* ── Friends tab ── */}
        {tab === 'friends' && (
          <>
            {/* Add friend */}
            <div style={{ display: 'flex', gap: 6, padding: '6px 12px 10px' }}>
              <input
                className="pr-input"
                style={{ height: 34, fontSize: 13, flex: 1 }}
                placeholder={t('friends.addFriend', 'Dodaj znajomego…')}
                value={addUsername}
                onChange={e => setAddUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddFriend()}
              />
              <button className="pr-btn pr-btn-primary pr-btn-sm" style={{ padding: '0 10px', height: 34 }} onClick={handleAddFriend}>
                <UserPlus size={14} />
              </button>
            </div>

            {/* Friend requests */}
            {requests.length > 0 && (
              <>
                <div className="pr-sidebar-section">{t('friends.requests', 'Zaproszenia')}</div>
                {requests.map(req => (
                  <div key={req._id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', margin: '0 6px', borderRadius: 8,
                    background: 'rgba(252,211,77,.08)', border: '1px solid rgba(252,211,77,.18)',
                    marginBottom: 4,
                  }}>
                    <div className="pr-avatar pr-avatar-sm" style={{ background: 'linear-gradient(135deg,#FCD34D,#F59E0B)', color: '#3B2500' }}>
                      {req.from.username.slice(0, 2).toUpperCase()}
                    </div>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--pr-text-primary)' }}>
                      {req.from.username}
                    </span>
                    <button className="pr-btn pr-btn-sm" style={{ padding: '0 8px', height: 28, background: 'rgba(74,222,128,.15)', color: 'var(--pr-success)', border: '1px solid rgba(74,222,128,.3)' }}
                      onClick={() => handleAccept(req._id)}>
                      <Check size={13} />
                    </button>
                    <button className="pr-btn pr-btn-ghost pr-btn-sm" style={{ padding: '0 6px', height: 28 }}
                      onClick={() => handleReject(req._id)}>
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </>
            )}

            {/* Online friends */}
            {filtered(online).length > 0 && (
              <div className="pr-sidebar-section">
                {t('friends.online', 'Online').toUpperCase()} — {filtered(online).length}
              </div>
            )}
            {filtered(online).map(f => <FriendRow key={f._id} friend={f} onChat={() => openChat(f)} />)}

            {/* Offline friends */}
            {filtered(offline).length > 0 && (
              <div className="pr-sidebar-section" style={{ marginTop: 8 }}>
                {t('friends.offline', 'Offline').toUpperCase()} — {filtered(offline).length}
              </div>
            )}
            {filtered(offline).map(f => <FriendRow key={f._id} friend={f} onChat={() => openChat(f)} />)}

            {friends.length === 0 && (
              <div style={{ padding: '20px 16px', color: 'var(--pr-text-muted)', fontSize: 13, textAlign: 'center' }}>
                {t('friends.noFriends', 'Brak znajomych. Dodaj kogoś!')}
              </div>
            )}
          </>
        )}

        {/* ── DM tab ── */}
        {tab === 'dm' && (
          chatWith ? (
            <DMChat
              friend={chatWith}
              messages={chatMessages}
              draft={messageText}
              setDraft={setMessageText}
              onSend={sendMessage}
              onBack={() => setChatWith(null)}
              myId={user.id}
              chatEndRef={chatEndRef}
              t={t}
            />
          ) : (
            <>
              {friends.map(f => (
                <div key={f._id} className="pr-friend-row" onClick={() => openChat(f)}>
                  <div style={{ position: 'relative' }}>
                    <div className="pr-avatar pr-avatar-md">
                      {f.username.slice(0, 2).toUpperCase()}
                    </div>
                    <span className={`pr-dot ${f.online ? 'pr-dot-online' : ''}`}
                      style={{ position: 'absolute', right: -2, bottom: -2, border: '2px solid var(--ink-800)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--pr-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.username}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--pr-text-muted)' }}>
                      {f.online ? t('friends.online', 'online') : t('friends.offline', 'offline')}
                    </div>
                  </div>
                </div>
              ))}
              {friends.length === 0 && (
                <div style={{ padding: '20px 16px', color: 'var(--pr-text-muted)', fontSize: 13, textAlign: 'center' }}>
                  {t('friends.noFriends', 'Brak znajomych.')}
                </div>
              )}
            </>
          )
        )}
      </div>
    </aside>
  );
}

function FriendRow({ friend, onChat }: { friend: Friend; onChat: () => void }) {
  return (
    <div className="pr-friend-row" onClick={onChat}>
      <div style={{ position: 'relative' }}>
        <div className="pr-avatar pr-avatar-md">
          {friend.username.slice(0, 2).toUpperCase()}
        </div>
        <span
          className={`pr-dot ${friend.online ? 'pr-dot-online' : ''}`}
          style={{ position: 'absolute', right: -2, bottom: -2, border: '2px solid var(--ink-800)' }}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--pr-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {friend.username}
        </div>
        <div style={{ fontSize: 12, color: 'var(--pr-text-muted)' }}>
          {friend.online ? 'online' : 'offline'}
        </div>
      </div>
    </div>
  );
}

function DMChat({
  friend, messages, draft, setDraft, onSend, onBack, myId, chatEndRef, t,
}: {
  friend: Friend;
  messages: DmMessage[];
  draft: string;
  setDraft: (v: string) => void;
  onSend: () => void;
  onBack: () => void;
  myId?: string;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  t: (k: string, d?: string) => string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px', borderBottom: '1px solid var(--pr-border-subtle)',
      }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--pr-text-muted)', cursor: 'pointer', padding: 4 }}>
          <ArrowLeft size={16} />
        </button>
        <div className="pr-avatar pr-avatar-sm">{friend.username.slice(0, 2).toUpperCase()}</div>
        <span style={{ fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 14 }}>{friend.username}</span>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.fromId === myId ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
            <div style={{
              padding: '8px 12px', borderRadius: 12, fontSize: 13, lineHeight: 1.4,
              background: m.fromId === myId
                ? 'linear-gradient(180deg, var(--pr-accent), #BB90E8)'
                : 'rgba(29,38,125,.6)',
              color: m.fromId === myId ? '#1A0B2E' : 'var(--pr-text-primary)',
              border: m.fromId === myId ? 'none' : '1px solid var(--pr-border-subtle)',
            }}>
              {m.text}
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 10px' }}>
        <input
          className="pr-input"
          style={{ height: 34, fontSize: 13, flex: 1 }}
          placeholder={t('friends.sendMessage', 'Napisz wiadomość…')}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSend()}
        />
        <button className="pr-btn pr-btn-primary pr-btn-sm" style={{ padding: '0 10px', height: 34 }} onClick={onSend}>
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
