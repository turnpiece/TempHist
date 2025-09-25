// router.js
(() => {
  const routes = ["/today", "/week", "/month", "/year"];
  const outlet = document.getElementById("viewOutlet");
  const sidebar = document.getElementById("sidebar");
  const burgerBtn = document.getElementById("burgerBtn");

  // Check if this is a standalone page (not the main SPA)
  const isStandalonePage = !outlet || !outlet.querySelector('section[data-view]');

  function setActiveLink(path) {
    if (isStandalonePage) {
      // On standalone pages, determine which page we're on based on the current URL
      const currentPage = window.location.pathname;
      let activeRoute = null;
      
      if (currentPage.includes('/privacy')) {
        activeRoute = '/privacy';
      } else if (currentPage.includes('/about')) {
        activeRoute = '/about';
      }
      
      // Set all links to inactive first
      document.querySelectorAll('#sidebar a[data-route]').forEach(a => {
        a.setAttribute('aria-current', 'false');
      });
      
      // Set the appropriate link as active
      if (activeRoute) {
        const activeLink = document.querySelector(`#sidebar a[data-route="${activeRoute}"]`);
        if (activeLink) {
          activeLink.setAttribute('aria-current', 'page');
        }
      }
      return;
    }
    
    document.querySelectorAll('#sidebar a[data-route]').forEach(a => {
      a.setAttribute('aria-current', a.dataset.route === path ? 'page' : 'false');
    });
  }

  function showView(id) {
    if (!outlet) return;
    outlet.querySelectorAll('section[data-view]').forEach(sec => {
      sec.hidden = sec.id !== id;
    });
  }

  function currentPath() {
    const raw = location.hash.replace(/^#/, "");
    if (!raw || raw === "/") return "/today";
    const [path] = raw.split("?"); // ignore query for now
    return routes.includes(path) ? path : "/today";
  }

  async function handleRoute() {
    const path = currentPath();
    setActiveLink(path);
    
    // Don't try to show views on standalone pages
    if (isStandalonePage) {
      closeMenu();
      return;
    }
    
    switch (path) {
      case "/today":
        showView("todayView");
        window.TempHistViews?.today?.render?.();
        break;
      case "/week":
        showView("weekView");
        await window.TempHistViews?.week?.render?.();
        break;
      case "/month":
        showView("monthView");
        await window.TempHistViews?.month?.render?.();
        break;
      case "/year":
        showView("yearView");
        await window.TempHistViews?.year?.render?.();
        break;
    }
    closeMenu();
  }

  function openMenu() {
    sidebar.classList.add("open");
    document.body.classList.add("menu-open");
    burgerBtn.setAttribute("aria-expanded", "true");
    burgerBtn.textContent = "✕";
  }
  function closeMenu() {
    sidebar.classList.remove("open");
    document.body.classList.remove("menu-open");
    burgerBtn.setAttribute("aria-expanded", "false");
    burgerBtn.textContent = "☰";
  }

  burgerBtn?.addEventListener("click", () => {
    const open = sidebar.classList.contains("open");
    if (open) closeMenu(); else openMenu();
  });

  sidebar?.addEventListener("click", (e) => {
    const target = e.target.closest("a[data-route]");
    if (target) {
      // On standalone pages, let the links work normally (they'll navigate to index.html)
      if (isStandalonePage) {
        return; // Don't prevent default, let the link work
      }
      
      // Only prevent default for SPA routes, not for external links like /about and /privacy
      const route = target.dataset.route;
      const spaRoutes = ["/today", "/week", "/month", "/year"];
      
      if (spaRoutes.includes(route)) {
        e.preventDefault();
        // Handle SPA navigation
        window.location.hash = `#${route}`;
      }
      // Let /about and /privacy links work normally (don't prevent default)
    }
  });

  // Handle logo/title click to navigate to today view
  document.querySelector('.header-left a')?.addEventListener("click", (e) => {
    if (isStandalonePage) {
      return; // Let it work normally on standalone pages
    }
    e.preventDefault();
    window.location.hash = '#/today';
  });

  window.addEventListener("hashchange", handleRoute);
  window.addEventListener("DOMContentLoaded", handleRoute);

  // Expose a small API for views to trigger a re-route if needed
  window.TempHistRouter = { handleRoute };
})();
