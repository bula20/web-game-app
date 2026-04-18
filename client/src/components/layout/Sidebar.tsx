import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { useSocket } from '@/context/SocketContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Users, UserPlus, MessageCircle, X, Send } from 'lucide-react';
import api from '@/lib/api';
import type { Friend, FriendRequest } from '@/types/user';

export function Sidebar() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { socket } = useSocket();
  const [isOpen, setIsOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ _id: string; username: string }[]>([]);
  const [addUsername, setAddUsername] = useState('');
  const [chatWith, setChatWith] = useState<Friend | null>(null);
  const [chatMessages, setChatMessages] = useState<{ from: string; fromId: string; text: string; timestamp: string }[]>([]);
  const [messageText, setMessageText] = useState('');

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

    socket.on('friend:request_received', () => {
      loadRequests();
    });

    socket.on('friend:accepted', () => {
      loadFriends();
    });

    socket.on('chat:direct_message', (msg: { from: string; fromId: string; text: string; timestamp: string }) => {
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
    try {
      const res = await api.get('/friends');
      setFriends(res.data);
    } catch { /* ignore */ }
  };

  const loadRequests = async () => {
    try {
      const res = await api.get('/friends/requests');
      setRequests(res.data);
    } catch { /* ignore */ }
  };

  const handleAddFriend = async () => {
    if (!addUsername.trim()) return;
    try {
      await api.post('/friends/request', { username: addUsername.trim() });
      setAddUsername('');
    } catch { /* ignore */ }
  };

  const handleAccept = async (requestId: string) => {
    try {
      await api.post(`/friends/accept/${requestId}`);
      loadFriends();
      loadRequests();
    } catch { /* ignore */ }
  };

  const handleReject = async (requestId: string) => {
    try {
      await api.post(`/friends/reject/${requestId}`);
      loadRequests();
    } catch { /* ignore */ }
  };

  const openChat = (friend: Friend) => {
    setChatWith(friend);
    setChatMessages([]);
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

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await api.get(`/users/search?q=${encodeURIComponent(q)}`);
      setSearchResults(res.data);
    } catch { /* ignore */ }
  };

  if (!user || user.isGuest) return null;

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        className="fixed bottom-4 right-4 z-50 rounded-full h-12 w-12 shadow-lg"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Users className="h-5 w-5" />
        {requests.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
            {requests.length}
          </span>
        )}
      </Button>

      {isOpen && (
        <div className="fixed right-0 top-0 h-full w-80 bg-background border-l shadow-xl z-50 flex flex-col">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="font-semibold">{t('friends.title')}</h2>
            <Button variant="ghost" size="icon" onClick={() => { setIsOpen(false); setChatWith(null); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {chatWith ? (
            <div className="flex flex-col flex-1 overflow-hidden min-h-0">
              <div className="flex items-center gap-2 p-3 border-b">
                <Button variant="ghost" size="sm" onClick={() => setChatWith(null)}>
                  &larr;
                </Button>
                <span className="font-medium">{chatWith.username}</span>
              </div>
              <ScrollArea className="flex-1 min-h-0 p-3">
                <div className="space-y-2">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.fromId === user?.id ? 'items-end' : 'items-start'}`}>
                      <div className={`rounded-lg px-3 py-1.5 text-sm max-w-[80%] ${msg.fromId === user?.id ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="p-3 border-t flex gap-2">
                <Input
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  placeholder={t('friends.sendMessage')}
                  className="flex-1"
                />
                <Button size="icon" onClick={sendMessage}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-3">
                {/* Add friend */}
                <div className="flex gap-2">
                  <Input
                    value={addUsername}
                    onChange={e => setAddUsername(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddFriend()}
                    placeholder={t('friends.addFriend')}
                    className="flex-1"
                  />
                  <Button size="icon" onClick={handleAddFriend}>
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </div>

                {/* Search */}
                <Input
                  value={searchQuery}
                  onChange={e => handleSearch(e.target.value)}
                  placeholder={t('friends.search')}
                />
                {searchResults.length > 0 && (
                  <div className="space-y-1">
                    {searchResults.map(u => (
                      <div key={u._id} className="flex items-center justify-between p-2 rounded hover:bg-muted">
                        <span className="text-sm">{u.username}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Friend requests */}
                {requests.length > 0 && (
                  <>
                    <Separator />
                    <h3 className="text-sm font-medium">{t('friends.requests')}</h3>
                    {requests.map(req => (
                      <div key={req._id} className="flex items-center justify-between p-2 rounded bg-muted">
                        <span className="text-sm">{req.from.username}</span>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => handleAccept(req._id)}>
                            {t('friends.accept')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleReject(req._id)}>
                            {t('friends.reject')}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* Friends list */}
                <Separator />
                <h3 className="text-sm font-medium">{t('friends.title')}</h3>
                {friends.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('friends.noFriends')}</p>
                ) : (
                  friends.map(friend => (
                    <div key={friend._id} className="flex items-center justify-between p-2 rounded hover:bg-muted">
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${friend.online ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <span className="text-sm">{friend.username}</span>
                        <Badge variant="outline" className="text-xs">
                          {friend.online ? t('friends.online') : t('friends.offline')}
                        </Badge>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => openChat(friend)}>
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      )}
    </>
  );
}
