export type PushPhase = 'metadata' | 'upload' | 'captions' | 'deletes' | 'finalize';

export interface PushProgress {
  phase: PushPhase;
  current?: number;
  total?: number;
}

export function pushProgressLabel(p: PushProgress): string {
  switch (p.phase) {
    case 'metadata':
      return 'Saving gallery details…';
    case 'upload':
      return p.current && p.total ? `Uploading photo ${p.current} of ${p.total}…` : 'Uploading photos…';
    case 'captions':
      return 'Updating captions…';
    case 'deletes':
      return 'Removing photos…';
    case 'finalize':
      return 'Finishing…';
  }
}
