import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { TwdbClient } from '@joelberger/twdb-client';
import {
  readMachineYaml,
  readTwdbYaml,
  writeTwdbYaml,
  type MachinePhoto,
  type TwdbDoc,
} from './machineYaml';
import { partitionPhotos, missingPushFields, newGalleryPhotos, pushLinks } from './pushPlan';

export class PushValidationError extends Error {}

export interface PushResult {
  created: boolean;
  photosUploaded: number;
  url: string;
}

const DEFAULT_COLLECTION = 'My Collection' as const;

const hashFile = (abs: string) => createHash('sha256').update(readFileSync(abs)).digest('hex');

async function safeAddPhoto(client: TwdbClient, galleryId: string, abs: string): Promise<string | null> {
  try {
    const r = await client.addPhoto(galleryId, abs, { description: '' });
    return r.photoId;
  } catch (err) {
    console.warn('TWDB addPhoto failed', abs, String(err));
    return null;
  }
}

// Push one machine. Creates the gallery (cover/type-sample via createMachine, gallery via addPhoto,
// plus links) on first push; on later pushes only adds gallery photos lacking a twdbPhotoId.
// Writes twdbUrl/galleryId immediately after create for machine-level idempotency.
export async function pushMachine(client: TwdbClient, absPath: string): Promise<PushResult> {
  const doc = readMachineYaml(absPath);
  const state = readTwdbYaml(absPath);

  const missing = missingPushFields(doc);
  if (missing.length) throw new PushValidationError(`Cannot push — missing: ${missing.join(', ')}`);

  const plan = partitionPhotos(doc.photos);
  const abs = (p: MachinePhoto) => path.join(absPath, p.file);

  const created = !state.twdbUrl;
  let galleryId: string;
  let url: string;
  const uploaded: { file: string; photoId: string }[] = [];

  if (created) {
    const ref = await client.createMachine({
      collection: doc.collection ?? DEFAULT_COLLECTION,
      brand: doc.make as string,
      model: doc.model as string,
      year: doc.year as string,
      serialNo: doc.serialNo ?? '',
      description: doc.description ?? '',
      coverImage: plan.cover ? abs(plan.cover) : undefined,
      typeSampleImage: plan.typeSample ? abs(plan.typeSample) : undefined,
    });
    galleryId = ref.id;
    url = ref.url;
    // Idempotency: persist immediately so a later failure never re-creates the gallery.
    writeTwdbYaml(absPath, { ...state, twdbUrl: url, galleryId });
    for (const p of plan.gallery) {
      const id = await safeAddPhoto(client, galleryId, abs(p));
      if (id) uploaded.push({ file: p.file, photoId: id });
    }
  } else {
    url = state.twdbUrl as string;
    galleryId = state.galleryId ?? '';
    if (!galleryId) throw new Error(`No galleryId recorded for ${absPath}`);
    for (const p of newGalleryPhotos(plan.gallery, state)) {
      const id = await safeAddPhoto(client, galleryId, abs(p));
      if (id) uploaded.push({ file: p.file, photoId: id });
    }
  }

  const photos: TwdbDoc['photos'] = { ...state.photos };
  // Record content hashes for create-time photos (cover/type-sample) even when their id isn't recoverable.
  if (created && plan.cover) photos[plan.cover.file] = { ...photos[plan.cover.file], hash: hashFile(abs(plan.cover)) };
  if (created && plan.typeSample)
    photos[plan.typeSample.file] = { ...photos[plan.typeSample.file], hash: hashFile(abs(plan.typeSample)) };

  if (uploaded.length > 0 || (created && plan.cover)) {
    const list = await client.listMachinePhotos(galleryId);
    const urlById = new Map(list.map((p) => [p.photoId, p.url]));
    const addedIds = new Set(uploaded.map((u) => u.photoId));
    for (const u of uploaded) {
      photos[u.file] = {
        twdbPhotoId: u.photoId,
        twdbPhotoUrl: urlById.get(u.photoId) ?? '',
        hash: hashFile(path.join(absPath, u.file)),
      };
    }
    // The cover (sent via createMachine) returns no id; it's the single listed id we didn't add.
    // Only assign when unambiguous (mirrors DT; type-sample id is a separate slot, deferred).
    if (created && plan.cover) {
      const unmapped = list.map((p) => p.photoId).filter((pid) => !addedIds.has(pid));
      if (unmapped.length === 1) {
        photos[plan.cover.file] = {
          ...photos[plan.cover.file],
          twdbPhotoId: unmapped[0],
          twdbPhotoUrl: urlById.get(unmapped[0]) ?? '',
        };
      } else {
        console.warn('TWDB push: could not uniquely identify the cover photo id; left unset');
      }
    }
  }

  if (created) {
    const links = pushLinks(doc);
    if (links.length) await client.setLinks(galleryId, links);
  }

  writeTwdbYaml(absPath, { twdbUrl: url, galleryId, photos, lastPushedAt: new Date().toISOString() });

  const photosUploaded = created
    ? (plan.cover ? 1 : 0) + (plan.typeSample ? 1 : 0) + uploaded.length
    : uploaded.length;
  return { created, photosUploaded, url };
}
