/**
 * Mobile top-nav drawer — split out of splash.ts so lean entry points (e.g.
 * the share page) can wire up the hamburger menu without pulling in splash.ts's
 * whole module graph (about/feed/locations/today views).
 */

declare const debugLog: (...args: any[]) => void;

/**
 * Wire up the mobile top-nav drawer.
 *
 * The drawer opens when the user taps the topnav hamburger button (<900px),
 * dismisses on backdrop tap, link tap, Escape, or a second tap of the button.
 * Listeners are bound only once per page load.
 */
let drawerListenersAttached = false;
export function setupMobileNavigation(): void {
  if (drawerListenersAttached) return;

  const burgerBtn = document.getElementById('burgerBtn');
  const drawer = document.getElementById('topnavDrawer');
  const backdrop = document.getElementById('topnavBackdrop');

  if (!burgerBtn || !drawer || !backdrop) {
    debugLog('Drawer elements not found — burgerBtn:', !!burgerBtn, 'drawer:', !!drawer, 'backdrop:', !!backdrop);
    return;
  }

  const closeDrawer = () => {
    drawer.classList.remove('is-open');
    drawer.setAttribute('hidden', '');
    backdrop.setAttribute('hidden', '');
    burgerBtn.setAttribute('aria-expanded', 'false');
    burgerBtn.setAttribute('aria-label', 'Open menu');
    document.body.classList.remove('has-drawer-open');
  };

  const openDrawer = () => {
    drawer.removeAttribute('hidden');
    backdrop.removeAttribute('hidden');
    // Force a reflow so the transform transition runs from translateX(100%)
    drawer.offsetWidth;
    drawer.classList.add('is-open');
    burgerBtn.setAttribute('aria-expanded', 'true');
    burgerBtn.setAttribute('aria-label', 'Close menu');
    document.body.classList.add('has-drawer-open');
  };

  burgerBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (drawer.classList.contains('is-open')) closeDrawer();
    else openDrawer();
  });

  backdrop.addEventListener('click', closeDrawer);

  drawer.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeDrawer);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('is-open')) closeDrawer();
  });

  drawerListenersAttached = true;
  debugLog('Top-nav drawer wired');
}

/**
 * Handle window resize to ensure the drawer stays in a sane state when the
 * viewport crosses the 900px breakpoint (e.g. orientation change).
 */
export function handleWindowResize(): void {
  if (window.innerWidth > 900) {
    const drawer = document.getElementById('topnavDrawer');
    const backdrop = document.getElementById('topnavBackdrop');
    const burgerBtn = document.getElementById('burgerBtn');
    if (drawer?.classList.contains('is-open')) {
      drawer.classList.remove('is-open');
      drawer.setAttribute('hidden', '');
      backdrop?.setAttribute('hidden', '');
      burgerBtn?.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('has-drawer-open');
    }
  }
}
