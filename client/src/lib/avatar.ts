



export function avatarClass(preset?: string): string {
  if (!preset || preset.startsWith('img:')) return 'av-1';
  const match = preset.match(/^color:([1-8])$/);
  return match ? `av-${match[1]}` : 'av-1';
}


export function avatarImgSrc(preset?: string): string | null {
  if (!preset || !preset.startsWith('img:')) return null;
  const filename = preset.slice(4);
  return `/avatars/${filename}`;
}


export function avatarClassFromId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return `av-${(hash % 8) + 1}`;
}
