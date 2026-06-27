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
import { partitionPhotos, missingPushFields, reconcilePhotos, pushLinks } from './pushPlan';
import { type PushProgress } from './pushProgress';

export class PushValidationError extends Error {}

export interface PushResult {
  created: boolean;
  photosUploaded: number;
  updated: number;
  deleted: number;
  url: string;
}

const DEFAULT_COLLECTION = 'My Collection' as const;

const hashFile = (abs: string) => createHash('sha256').update(readFileSync(abs)).digest('hex');

async function safeAddPhoto(
  client: TwdbClient,
  galleryId: string,
  abs: string,
  caption: string,
): Promise<string | null> {
  try {
    const r = await client.addPhoto(galleryId, abs, { description: caption });
    return r.photoId;
  } catch (err) {
    console.warn('TWDB addPhoto failed', abs, String(err));
    return null;
  }
}

// Push one machine, reconciling its photos against TWDB. First push: createMachine (cover/type-sample
// + metadata), write twdbUrl/galleryId immediately (idempotency). Re-push: updateMachine (metadata).
// Then reconcile gallery photos — add new (with captions), update changed captions, delete skipped —
// and refresh links. State (ids/urls/hash/caption) is written to machine.twdb.yaml.
export async function pushMachine(
  client: TwdbClient,
  absPath: string,
  onProgress: (p: PushProgress) => void = () => {},
): Promise<PushResult> {
  const doc = readMachineYaml(absPath);
  const state = readTwdbYaml(absPath);

  const missing = missingPushFields(doc);
  if (missing.length) throw new PushValidationError(`Cannot push — missing: ${missing.join(', ')}`);

  const plan = partitionPhotos(doc.photos);
  const abs = (p: MachinePhoto) => path.join(absPath, p.file);
  const fileAbs = (file: string) => path.join(absPath, file);

  const created = !state.twdbUrl;
  let galleryId: string;
  let url: string;

  const metadata = {
    collection: doc.collection ?? DEFAULT_COLLECTION,
    brand: doc.make as string,
    model: doc.model as string,
    year: doc.year as string,
    serialNo: doc.serialNo ?? '',
    description: doc.description ?? '',
  };

  // Cover/type-sample are separate TWDB slots (not gallery photos). Detect a changed image by
  // comparing the current file's hash to the one recorded at the last push.
  const coverHash = plan.cover ? hashFile(abs(plan.cover)) : undefined;
  const typeSampleHash = plan.typeSample ? hashFile(abs(plan.typeSample)) : undefined;
  const coverChanged = !!plan.cover && coverHash !== state.photos[plan.cover.file]?.hash;
  const typeSampleChanged = !!plan.typeSample && typeSampleHash !== state.photos[plan.typeSample.file]?.hash;

  onProgress({ phase: 'metadata' });

  if (created) {
    const ref = await client.createMachine({
      ...metadata,
      coverImage: plan.cover ? abs(plan.cover) : undefined,
      typeSampleImage: plan.typeSample ? abs(plan.typeSample) : undefined,
    });
    galleryId = ref.id;
    url = ref.url;
    // Idempotency: persist immediately so a later failure never re-creates the gallery.
    writeTwdbYaml(absPath, { ...state, twdbUrl: url, galleryId });
  } else {
    url = state.twdbUrl as string;
    galleryId = state.galleryId ?? '';
    if (!galleryId) throw new Error(`No galleryId recorded for ${absPath}`);
    // Re-send cover/type-sample images only when they changed (else TWDB keeps the existing ones).
    // Keep the stored url: a year/model edit changes the canonical slug, but it still resolves by id.
    await client.updateMachine(galleryId, {
      ...metadata,
      coverImage: plan.cover && coverChanged ? abs(plan.cover) : undefined,
      typeSampleImage: plan.typeSample && typeSampleChanged ? abs(plan.typeSample) : undefined,
    });
  }

  const photos: TwdbDoc['photos'] = { ...state.photos };
  if (plan.cover && coverChanged) photos[plan.cover.file] = { ...photos[plan.cover.file], hash: coverHash };
  if (plan.typeSample && typeSampleChanged)
    photos[plan.typeSample.file] = { ...photos[plan.typeSample.file], hash: typeSampleHash };

  // Reconcile gallery photos against recorded state.
  const { adds, captionUpdates, deletes } = reconcilePhotos(doc, state);

  const uploaded: { file: string; photoId: string; caption: string }[] = [];
  for (let i = 0; i < adds.length; i++) {
    const p = adds[i];
    onProgress({ phase: 'upload', current: i + 1, total: adds.length });
    const caption = p.caption ?? '';
    const id = await safeAddPhoto(client, galleryId, abs(p), caption);
    if (id) uploaded.push({ file: p.file, photoId: id, caption });
  }

  let updated = 0;
  if (captionUpdates.length) onProgress({ phase: 'captions' });
  for (const u of captionUpdates) {
    await client.updatePhoto(galleryId, u.photoId, { description: u.caption });
    photos[u.file] = { ...photos[u.file], caption: u.caption };
    updated++;
  }

  let deleted = 0;
  if (deletes.length) onProgress({ phase: 'deletes' });
  for (const d of deletes) {
    await client.deletePhoto(galleryId, d.photoId);
    delete photos[d.file];
    deleted++;
  }

  onProgress({ phase: 'finalize' });

  // Recover id→url for newly uploaded gallery photos from steady state (one call).
  if (uploaded.length > 0) {
    const list = await client.listMachinePhotos(galleryId);
    const urlById = new Map(list.map((p) => [p.photoId, p.url]));
    for (const u of uploaded) {
      photos[u.file] = {
        twdbPhotoId: u.photoId,
        twdbPhotoUrl: urlById.get(u.photoId) ?? '',
        hash: hashFile(fileAbs(u.file)),
        caption: u.caption,
      };
    }
  }

  // Sync links on both create and update (setLinks replaces the gallery's links).
  const links = pushLinks(doc);
  if (links.length) await client.setLinks(galleryId, links);

  writeTwdbYaml(absPath, { twdbUrl: url, galleryId, photos, lastPushedAt: new Date().toISOString() });

  const photosUploaded = (coverChanged ? 1 : 0) + (typeSampleChanged ? 1 : 0) + uploaded.length;
  return { created, photosUploaded, updated, deleted, url };
}
