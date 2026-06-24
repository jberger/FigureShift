import { describe, it, expect } from 'vitest';
import { AuthError } from '@joelberger/twdb-client';
import { attemptLogin } from './twdbAuth';

const okClient = () => ({ login: async () => {} }) as never;
const authFailClient = () =>
  ({ login: async () => { throw new AuthError('bad creds'); } }) as never;

describe('attemptLogin', () => {
  it('returns ok on successful login', async () => {
    const res = await attemptLogin('user', 'pass', okClient);
    expect(res).toEqual({ ok: true });
  });

  it('maps AuthError to a friendly failure message', async () => {
    const res = await attemptLogin('user', 'bad', authFailClient);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/check your username/i);
  });

  it('rejects empty credentials without constructing a client', async () => {
    const res = await attemptLogin('', '', () => { throw new Error('should not construct'); });
    expect(res.ok).toBe(false);
  });
});
