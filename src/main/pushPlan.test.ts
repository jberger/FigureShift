import { describe, it, expect } from 'vitest';
import { partitionPhotos, missingPushFields, newGalleryPhotos, pushLinks, reconcilePhotos } from './pushPlan';
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

describe('reconcilePhotos', () => {
  const doc = (photos: MachinePhoto[]): MachineDoc => ({
    make: 'R', model: 'M', year: '1948', serialNo: 's', description: 'd', photos,
  });

  it('adds gallery photos with no id, flags caption changes, deletes skipped on-TWDB photos', () => {
    const photos: MachinePhoto[] = [
      { file: 'a.jpg', role: 'gallery', caption: 'new A' }, // on TWDB, caption changed -> update
      { file: 'b.jpg', role: 'gallery' },                  // not on TWDB -> add
      { file: 'c.jpg', role: 'skip' },                     // on TWDB but skip -> delete
      { file: 'd.jpg', role: 'gallery', caption: 'same' }, // on TWDB, caption unchanged -> noop
    ];
    const state: TwdbDoc = {
      photos: {
        'a.jpg': { twdbPhotoId: '1', caption: 'old A' },
        'c.jpg': { twdbPhotoId: '3' },
        'd.jpg': { twdbPhotoId: '4', caption: 'same' },
      },
    };
    const r = reconcilePhotos(doc(photos), state);
    expect(r.adds.map((p) => p.file)).toEqual(['b.jpg']);
    expect(r.captionUpdates).toEqual([{ file: 'a.jpg', photoId: '1', caption: 'new A' }]);
    expect(r.deletes).toEqual([{ file: 'c.jpg', photoId: '3' }]);
  });

  it('treats missing/empty captions as equal (no spurious update)', () => {
    const photos: MachinePhoto[] = [{ file: 'a.jpg', role: 'gallery' }];
    const state: TwdbDoc = { photos: { 'a.jpg': { twdbPhotoId: '1' } } };
    expect(reconcilePhotos(doc(photos), state).captionUpdates).toEqual([]);
  });
});
