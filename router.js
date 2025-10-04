// router.js
(() => {
  const routes = ["/today", "/week", "/month", "/year", "/about", "/privacy"];
  const outlet = document.getElementById("viewOutlet");
  const sidebar = document.getElementById("sidebar");
  const burgerBtn = document.getElementById("burgerBtn");

  // Check if this is a standalone page (not the main SPA)
  // We're on a standalone page if we don't have the main app structure
  const isStandalonePage = !outlet || !document.querySelector('#todayView');
  
  // Debug logging for standalone page detection
  (window.debugLog || console.log)('Router: isStandalonePage detection:', {
    outlet: !!outlet,
    todayView: !!document.querySelector('#todayView'),
    isStandalonePage: isStandalonePage,
    currentPath: window.location.pathname
  });

  // For standalone pages, just set the active link and return
  if (isStandalonePage) {
    setActiveLink(window.location.pathname);
    return;
  }

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
    (window.debugLog || console.log)('Router: showing view:', id);
    if (!outlet) {
      (window.debugLog || console.log)('Router: no outlet found');
      return;
    }
    const sections = outlet.querySelectorAll('section[data-view]');
    (window.debugLog || console.log)('Router: found sections:', sections.length, Array.from(sections).map(s => s.id));
    sections.forEach(sec => {
      const shouldShow = sec.id === id;
      sec.hidden = !shouldShow;
      (window.debugLog || console.log)(`Router: section ${sec.id} hidden: ${!shouldShow}`);
    });
  }

  function currentPath() {
    // On standalone pages, determine path from the actual URL
    if (isStandalonePage) {
      const currentPage = window.location.pathname;
      if (currentPage.includes('/privacy')) {
        return '/privacy';
      } else if (currentPage.includes('/about')) {
        return '/about';
      }
      return '/today'; // fallback
    }
    
    // For SPA, use hash routing
    const raw = location.hash.replace(/^#/, "");
    if (!raw || raw === "/") return "/today";
    const [path] = raw.split("?"); // ignore query for now
    return routes.includes(path) ? path : "/today";
  }

  async function handleRoute() {
    const path = currentPath();
    (window.debugLog || console.log)('Router: handling path:', path, 'isStandalonePage:', isStandalonePage);
    setActiveLink(path);
    
    // Don't try to show views on standalone pages
    if (isStandalonePage) {
      (window.debugLog || console.log)('Router: Skipping view rendering on standalone page');
      closeMenu();
      return;
    }
    
    // Splash screen visibility is handled by proceedWithLocation function
    
    // Check if user is trying to access chart pages without a location
    const chartPages = ['/today', '/week', '/month', '/year'];
    if (chartPages.includes(path)) {
      (window.debugLog || console.log)('Router: Checking location for chart page:', {
        path: path,
        tempLocation: window.tempLocation,
        hasLocation: !!window.tempLocation
      });
      
      if (!window.tempLocation) {
        (window.debugLog || console.log)('Router: No location set, showing error message instead of redirecting');
        
        // Show error message instead of redirecting to splash screen
        if (window.updateDataNotice) {
          window.updateDataNotice('Please select a location to view temperature data. <a href="#/today" onclick="window.location.reload()">Go to home page</a>', {
            type: 'error',
            persistent: true
          });
        }
        
        // Still show the view but with error state
        showView("todayView");
        return;
      }
    }
    
    (window.debugLog || console.log)('Router: Proceeding with SPA view rendering');
    
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
      case "/about":
        showView("aboutView");
        await window.TempHistViews?.about?.render?.();
        break;
      case "/privacy":
        showView("privacyView");
        await window.TempHistViews?.privacy?.render?.();
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
      // Close menu on any navigation click
      closeMenu();
      
      // On standalone pages, let the links work normally (they'll navigate to index.html)
      if (isStandalonePage) {
        return; // Don't prevent default, let the link work
      }
      
      // Handle all SPA routes
      const route = target.dataset.route;
      const spaRoutes = ["/today", "/week", "/month", "/year", "/about", "/privacy"];
      
      if (spaRoutes.includes(route)) {
        e.preventDefault();
        // Handle SPA navigation
        window.location.hash = `#${route}`;
      }
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

  // Close menu when clicking outside of it
  document.addEventListener("click", (e) => {
    const isSidebarOpen = sidebar?.classList.contains("open");
    if (isSidebarOpen) {
      // Check if click is outside sidebar and burger button
      const isClickInsideSidebar = sidebar?.contains(e.target);
      const isClickOnBurger = burgerBtn?.contains(e.target);
      
      if (!isClickInsideSidebar && !isClickOnBurger) {
        closeMenu();
      }
    }
  });

  window.addEventListener("hashchange", handleRoute);
  window.addEventListener("DOMContentLoaded", handleRoute);

  // Expose a small API for views to trigger a re-route if needed
  window.TempHistRouter = { handleRoute };
})();
