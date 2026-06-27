import path from 'node:path';

// «base»-edited«ext», uniquified against existing names (case-insensitive): -edited, -edited-2, ...
export function editedFilename(original: string, existing: string[]): string {
  const ext = path.extname(original);
  const base = original.slice(0, original.length - ext.length);
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  const candidate = (n: number) => `${base}-edited${n > 1 ? `-${n}` : ''}${ext}`;
  let n = 1;
  while (taken.has(candidate(n).toLowerCase())) n++;
  return candidate(n);
}
