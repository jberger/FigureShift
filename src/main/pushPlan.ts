import { isValidTwdbYear } from '@joelberger/twdb-client';
import type { MachineDoc, MachineLink, MachinePhoto, TwdbDoc } from './machineYaml';

export interface PhotoPlan {
  cover: MachinePhoto | null;
  typeSample: MachinePhoto | null;
  gallery: MachinePhoto[];
}

// Partition by explicit role (skip excluded). cover/typeSample are exclusive (enforced in the UI).
export function partitionPhotos(photos: MachinePhoto[]): PhotoPlan {
  return {
    cover: photos.find((p) => p.role === 'cover') ?? null,
    typeSample: photos.find((p) => p.role === 'typeSample') ?? null,
    gallery: photos.filter((p) => p.role === 'gallery'),
  };
}

// Required for a TWDB create: make, model, valid year, serial number, description, a cover photo.
// (Some makes — e.g. Bing — genuinely lack serials; that exception is handled separately later.)
export function missingPushFields(doc: MachineDoc): string[] {
  const missing: string[] = [];
  if (!doc.make?.trim()) missing.push('make');
  if (!doc.model?.trim()) missing.push('model');
  if (!doc.year || !isValidTwdbYear(doc.year)) missing.push('a TWDB-valid year');
  if (!doc.serialNo?.trim()) missing.push('a serial number');
  if (!doc.description?.trim()) missing.push('description');
  if (!partitionPhotos(doc.photos).cover) missing.push('a cover photo');
  return missing;
}

// Gallery photos not yet on TWDB (no recorded twdbPhotoId) — the incremental add set.
export function newGalleryPhotos(gallery: MachinePhoto[], state: TwdbDoc): MachinePhoto[] {
  return gallery.filter((p) => !state.photos[p.file]?.twdbPhotoId);
}

export interface PhotoReconcile {
  adds: MachinePhoto[];
  captionUpdates: { file: string; photoId: string; caption: string }[];
  deletes: { file: string; photoId: string }[];
}

// Diff machine.yaml photos against recorded TWDB state (gallery photos only):
//  - role 'gallery' with no twdbPhotoId        -> add
//  - role 'gallery' on TWDB, caption changed   -> caption update
//  - role 'skip' that is on TWDB               -> delete
export function reconcilePhotos(doc: MachineDoc, state: TwdbDoc): PhotoReconcile {
  const adds: MachinePhoto[] = [];
  const captionUpdates: PhotoReconcile['captionUpdates'] = [];
  const deletes: PhotoReconcile['deletes'] = [];
  for (const p of doc.photos) {
    const st = state.photos[p.file];
    if (p.role === 'gallery') {
      if (!st?.twdbPhotoId) adds.push(p);
      else if ((st.caption ?? '') !== (p.caption ?? ''))
        captionUpdates.push({ file: p.file, photoId: st.twdbPhotoId, caption: p.caption ?? '' });
    } else if (p.role === 'skip' && st?.twdbPhotoId) {
      deletes.push({ file: p.file, photoId: st.twdbPhotoId });
    }
  }
  return { adds, captionUpdates, deletes };
}

// Freeform links to attach, dropping entries missing a name or url.
export function pushLinks(doc: MachineDoc): MachineLink[] {
  return (doc.links ?? []).filter((l) => l.name?.trim() && l.url?.trim());
}
