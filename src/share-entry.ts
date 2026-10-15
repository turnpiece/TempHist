/**
 * Entry point for share.html (/s/:id) — deliberately separate from main.ts so
 * share pages don't ship the SPA's router, splash screen, geolocation, and
 * location-carousel code, none of which a share page uses. See coreRuntime.ts
 * for the runtime globals this shares with main.ts, and share.scss (not
 * styles.scss) for the trimmed-down stylesheet.
 */
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '../share.scss';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import type { FirebaseUser } from './types/index.js';
import { initCoreRuntime } from './coreRuntime';
import { mountSharePageShell, loadSharePageData, showShareConnectionError } from './share';
import { attemptSignIn } from './auth/signIn';
import { setupMobileNavigation, handleWindowResize } from './topnav';

declare global {
  interface Window {
    Chart: any;
    'chartjs-plugin-annotation': any;
  }
}
declare const Chart: any;

initCoreRuntime();

// Build the dashboard skeleton immediately, with no network or auth
// dependency, so the container reaches its final size right away instead of
// staying hidden until Firebase anonymous auth resolves — see share.ts.
mountSharePageShell();

setupMobileNavigation();
window.addEventListener('resize', handleWindowResize);

// Sign-in can fail (content blockers, offline, App Check, rate limiting) or hang;
// show an accurate state with Retry rather than a spinner that never resolves.
// A late success still arrives through onAuthStateChanged below.
function startSignIn(): void {
  debugLog('Share page: starting Firebase anonymous sign-in...');
  void attemptSignIn(auth, 'share', (kind) => showShareConnectionError(kind, startSignIn));
}
startSignIn();

onAuthStateChanged(auth, (user: FirebaseUser | null) => {
  if (!user) return;
  globalThis.currentUser = user;
  debugLog('Share page: starting data fetch with Firebase user:', user.uid);
  loadSharePageData();
});
