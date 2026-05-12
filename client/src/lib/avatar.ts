// Avatar użytkownika może być jednym z dwóch typów:
//   - "color:N" (N = 1..8) - kolorowy gradient zdefiniowany w index.css jako klasa .av-N,
//   - "img:plik.png" - obrazek z public/avatars/.
// Goście oraz użytkownicy bez ustawionego avatara dostają deterministyczny kolor
// liczony z hasha id (avatarClassFromId), żeby ten sam użytkownik miał zawsze ten
// sam kolor we wszystkich miejscach UI.

// Mapuje preset na nazwę klasy CSS av-1..av-8 (gradient tła awatara).
export function avatarClass(preset?: string): string {
  if (!preset || preset.startsWith('img:')) return 'av-1';
  const match = preset.match(/^color:([1-8])$/);
  return match ? `av-${match[1]}` : 'av-1';
}

// Zwraca ścieżkę do pliku obrazka w public/avatars/ albo null, gdy preset
// jest typu kolorowego.
export function avatarImgSrc(preset?: string): string | null {
  if (!preset || !preset.startsWith('img:')) return null;
  const filename = preset.slice(4);
  return `/avatars/${filename}`;
}

// Deterministycznie wyznacza av-1..av-8 ze stringa (np. id gościa). Prosty hash
// FNV-podobny z mnożnikiem 31 wystarcza do równomiernego rozkładu po 8 koszach.
export function avatarClassFromId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return `av-${(hash % 8) + 1}`;
}
