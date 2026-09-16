/**
 * Entry point for share.html (/s/:id) — deliberately separate from main.ts so
 * share pages don't ship the SPA's router, splash screen, geolocation, and
 * location-carousel code, none of which a share page uses. See coreRuntime.ts
 * for the runtime globals this shares with main.ts.
 */
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '../styles.scss';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import type { FirebaseUser } from './types/index.js';
import { initCoreRuntime } from './coreRuntime';
import { mountSharePageShell, loadSharePageData } from './share';
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

debugLog('Share page: starting Firebase anonymous sign-in...');
signInAnonymously(auth).catch((error) => {
  console.error('Firebase anonymous sign-in error:', error);
});

onAuthStateChanged(auth, (user: FirebaseUser | null) => {
  if (!user) return;
  globalThis.currentUser = user;
  debugLog('Share page: starting data fetch with Firebase user:', user.uid);
  loadSharePageData();
});
