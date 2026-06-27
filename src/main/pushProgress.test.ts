import { describe, it, expect } from 'vitest';
import { pushProgressLabel } from './pushProgress';

describe('pushProgressLabel', () => {
  it('labels each phase', () => {
    expect(pushProgressLabel({ phase: 'metadata' })).toBe('Saving gallery details…');
    expect(pushProgressLabel({ phase: 'upload', current: 3, total: 8 })).toBe('Uploading photo 3 of 8…');
    expect(pushProgressLabel({ phase: 'captions' })).toBe('Updating captions…');
    expect(pushProgressLabel({ phase: 'deletes' })).toBe('Removing photos…');
    expect(pushProgressLabel({ phase: 'finalize' })).toBe('Finishing…');
  });
  it('upload without counts falls back gracefully', () => {
    expect(pushProgressLabel({ phase: 'upload' })).toBe('Uploading photos…');
  });
});
