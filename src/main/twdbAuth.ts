import { TwdbClient, AuthError } from '@joelberger/twdb-client';

export interface LoginResult {
  ok: boolean;
  message?: string;
}

/**
 * Attempt a TWDB login. `makeClient` is injectable so this is unit-testable
 * without hitting the network; production uses the default real client.
 */
export async function attemptLogin(
  username: string,
  password: string,
  makeClient: () => TwdbClient = () => new TwdbClient(),
): Promise<LoginResult> {
  if (!username || !password) {
    return { ok: false, message: 'Username and password are required.' };
  }
  try {
    await makeClient().login(username, password);
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthError) {
      return { ok: false, message: 'Login failed: check your username and password.' };
    }
    const message = err instanceof Error ? err.message : 'Unknown error during login.';
    return { ok: false, message: `Login error: ${message}` };
  }
}
