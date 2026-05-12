// Mała in-memory mapa odzwierciedlająca pole User.activeRoomCode dla gości.
// Goście nie mają wpisu w kolekcji User (są tworzeni ad-hoc na czas tokenu),
// więc ich "aktywny pokój" trzymamy tutaj. Mapa znika przy restarcie serwera -
// goście, którzy byli w pokoju, po restarcie zostaną usunięci przy następnej
// próbie pobrania activeRoom.
export interface GuestRoomEntry { code: string; displayName: string }
export const guestActiveRooms = new Map<string, GuestRoomEntry>();
