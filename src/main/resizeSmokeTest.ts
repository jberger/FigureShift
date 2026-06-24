import { resizeForGallery } from '@joelberger/twdb-client';

// A tiny 64x48 solid-color JPEG, embedded as base64. Decoding + re-encoding it
// through resizeForGallery exercises sharp's native binary end-to-end, which is
// exactly the packaging risk this spike de-risks.
const SAMPLE_JPEG_BASE64 =
  '/9j/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAwAEADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAL/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCLAWkAAAAAAAAAAAAAAAAAAAAAB//Z';

export interface SmokeTestResult {
  ok: boolean;
  bytes: number;
  contentType: string;
  message?: string;
}

export async function resizeSmokeTest(): Promise<SmokeTestResult> {
  try {
    const input = Buffer.from(SAMPLE_JPEG_BASE64, 'base64');
    const out = await resizeForGallery(input, 'smoke.jpg');
    return { ok: out.content.length > 0, bytes: out.content.length, contentType: out.contentType };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, bytes: 0, contentType: '', message };
  }
}
