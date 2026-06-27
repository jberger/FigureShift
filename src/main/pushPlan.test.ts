import { describe, it, expect } from 'vitest';
import { partitionPhotos, missingPushFields, newGalleryPhotos, pushLinks } from './pushPlan';
import type { MachineDoc, MachinePhoto, TwdbDoc } from './machineYaml';

const photos: MachinePhoto[] = [
  { file: 'cover.jpg', role: 'cover' },
  { file: 'ts.jpg', role: 'typeSample' },
  { file: 'g1.jpg', role: 'gallery' },
  { file: 'g2.jpg', role: 'gallery' },
  { file: 'x.jpg', role: 'skip' },
];

const full: MachineDoc = {
  make: 'Royal',
  model: 'Quiet De Luxe',
  year: '1948',
  serialNo: 'A-123456',
  description: 'nice',
  photos,
};

describe('partitionPhotos', () => {
  it('splits by explicit role, excluding skip', () => {
    const p = partitionPhotos(photos);
    expect(p.cover?.file).toBe('cover.jpg');
    expect(p.typeSample?.file).toBe('ts.jpg');
    expect(p.gallery.map((g) => g.file)).toEqual(['g1.jpg', 'g2.jpg']);
  });
});

describe('missingPushFields', () => {
  it('passes a complete machine', () => {
    expect(missingPushFields(full)).toEqual([]);
  });
  it('flags each missing requirement (serial IS required)', () => {
    expect(missingPushFields({ ...full, make: '' })).toContain('make');
    expect(missingPushFields({ ...full, model: '' })).toContain('model');
    expect(missingPushFields({ ...full, description: '' })).toContain('description');
    expect(missingPushFields({ ...full, year: '19zz' })).toContain('a TWDB-valid year');
    expect(missingPushFields({ ...full, serialNo: '' })).toContain('a serial number');
    expect(missingPushFields({ ...full, photos: photos.filter((p) => p.role !== 'cover') })).toContain('a cover photo');
  });
});

describe('newGalleryPhotos', () => {
  it('returns gallery photos not yet pushed (no twdbPhotoId in state)', () => {
    const state: TwdbDoc = { photos: { 'g1.jpg': { twdbPhotoId: '111' } } };
    const gallery = partitionPhotos(photos).gallery;
    expect(newGalleryPhotos(gallery, state).map((p) => p.file)).toEqual(['g2.jpg']);
  });
});

describe('pushLinks', () => {
  it('returns valid links, dropping blanks', () => {
    expect(
      pushLinks({ ...full, links: [{ name: 'YouTube', url: 'https://y' }, { name: '', url: 'x' }, { name: 'n', url: '' }] }),
    ).toEqual([{ name: 'YouTube', url: 'https://y' }]);
    expect(pushLinks(full)).toEqual([]);
  });
});
