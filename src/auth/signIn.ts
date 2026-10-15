/**
 * Firebase anonymous sign-in with a bounded wait and failure classification,
 * shared by the SPA (main.ts) and share pages (share-entry.ts) so both report
 * and present sign-in failures the same way.
 */
import { signInAnonymously, type Auth } from 'firebase/auth';
import { SIGN_IN_TIMEOUT_MS } from '../constants/index';
import { recordAuthFailure, type AuthFailureSurface } from '../analytics/analytics';

export type SignInFailureKind = 'network' | 'verification';

export const SIGN_IN_TIMEOUT_CODE = 'timeout';

export function errorCode(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code ? code : 'unknown';
}

/**
 * Network problems and timeouts are "couldn't connect"; anything else (blocked
 * or rejected attestation, rate limiting, internal errors) is treated as the
 * browser/privacy case.
 */
export function classifySignInError(err: unknown): SignInFailureKind {
  const code = errorCode(err);
  return code === 'auth/network-request-failed' || code === SIGN_IN_TIMEOUT_CODE
    ? 'network'
    : 'verification';
}

/**
 * signInAnonymously() that rejects after `ms` instead of hanging. The SDK call
 * may still settle later; callers must keep handling onAuthStateChanged so a
 * late success still starts the page.
 */
export function signInWithTimeout(auth: Auth, ms: number = SIGN_IN_TIMEOUT_MS): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(Object.assign(new Error('Anonymous sign-in timed out'), { code: SIGN_IN_TIMEOUT_CODE }));
    }, ms);
    signInAnonymously(auth).then(
      () => { clearTimeout(timer); resolve(); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/**
 * Run one sign-in attempt. On failure, records it via analytics and calls
 * `onFailure` with the classification; success is observed through
 * onAuthStateChanged, as before.
 */
export async function attemptSignIn(
  auth: Auth,
  surface: AuthFailureSurface,
  onFailure: (kind: SignInFailureKind) => void,
): Promise<void> {
  try {
    await signInWithTimeout(auth);
  } catch (err) {
    console.error('Firebase anonymous sign-in error:', err);
    recordAuthFailure('auth_signin', errorCode(err), surface);
    onFailure(classifySignInError(err));
  }
}
