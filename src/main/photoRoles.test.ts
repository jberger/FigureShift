import { describe, it, expect } from 'vitest';
import { setRole } from './photoRoles';
import type { MachinePhoto } from './machineYaml';

const base: MachinePhoto[] = [
  { file: 'a.jpg', role: 'cover' },
  { file: 'b.jpg', role: 'gallery' },
  { file: 'c.jpg', role: 'typeSample' },
];

describe('setRole', () => {
  it('assigning cover to another photo demotes the previous cover to gallery', () => {
    const out = setRole(base, 'b.jpg', 'cover');
    expect(out.find((p) => p.file === 'a.jpg')!.role).toBe('gallery');
    expect(out.find((p) => p.file === 'b.jpg')!.role).toBe('cover');
  });
  it('typeSample is also exclusive', () => {
    const out = setRole(base, 'b.jpg', 'typeSample');
    expect(out.find((p) => p.file === 'c.jpg')!.role).toBe('gallery');
    expect(out.find((p) => p.file === 'b.jpg')!.role).toBe('typeSample');
  });
  it('gallery and skip are not exclusive (no demotions)', () => {
    const out = setRole(base, 'b.jpg', 'skip');
    expect(out.find((p) => p.file === 'a.jpg')!.role).toBe('cover');
    expect(out.find((p) => p.file === 'c.jpg')!.role).toBe('typeSample');
    expect(out.find((p) => p.file === 'b.jpg')!.role).toBe('skip');
  });
  it('does not mutate the input array', () => {
    const copy = structuredClone(base);
    setRole(base, 'b.jpg', 'cover');
    expect(base).toEqual(copy);
  });
});
