import { describe, it, expect } from 'vitest';
import { resizeSmokeTest } from './resizeSmokeTest';

describe('resizeSmokeTest', () => {
  it('resizes the embedded sample via sharp and reports bytes', async () => {
    const res = await resizeSmokeTest();
    expect(res.ok).toBe(true);
    expect(res.bytes).toBeGreaterThan(0);
    expect(res.contentType).toBe('image/jpeg');
  });
});
