/**
 * Simple router implementation for SPA navigation
 */

import { clearAllLoadingIntervals } from '../utils/uiHelpers';
import { handleLocationChangeInternal } from '../splash/splash';

declare const debugLog: (...args: any[]) => void;

export class TempHistRouter {
  private views: Record<string, { render: () => void | Promise<void> }> = {};

  constructor() {
    debugLog('Router constructor called');
    // Listen for hash changes
    window.addEventListener('hashchange', () => {
      debugLog('Hash change detected');
      this.handleRoute();
    });
    
    // Listen for popstate events (back/forward buttons)
    window.addEventListener('popstate', () => {
      debugLog('Popstate event detected');
      this.handleRoute();
    });
    
    // Handle initial route when router is created
    setTimeout(() => {
      debugLog('Handling initial route');
      this.handleRoute();
    }, 100);
  }

  navigate(path: string): void {
    debugLog('Router navigating to:', path);
    window.location.hash = `#${path}`;
    this.handleRoute();
  }

  handleRoute(): void {
    debugLog('Router handling route change');
    
    // Clear any existing loading intervals when navigating
    clearAllLoadingIntervals();
    
    // Get current route from hash
    const hash = window.location.hash;
    const route = hash === '' ? '/today' : hash.substring(1); // Remove # prefix
    
    debugLog('Current route:', route);
    
    // Hide all views first
    const allViews = document.querySelectorAll('[data-view]');
    allViews.forEach(view => {
      (view as HTMLElement).hidden = true;
    });
    
    // Show the appropriate view
    let viewElement: HTMLElement | null;
    let viewKey: string;
    
    switch (route) {
      case '/today':
        viewElement = document.getElementById('todayView');
        viewKey = 'today';
        break;
      case '/week':
        viewElement = document.getElementById('weekView');
        viewKey = 'week';
        break;
      case '/month':
        viewElement = document.getElementById('monthView');
        viewKey = 'month';
        break;
      case '/year':
        viewElement = document.getElementById('yearView');
        viewKey = 'year';
        break;
      case '/splash':
        handleLocationChangeInternal();
        return;
      default:
        debugLog('Unknown route, defaulting to today');
        viewElement = document.getElementById('todayView');
        viewKey = 'today';
        this.navigate('/today');
        return;
    }
    
    if (viewElement) {
      viewElement.hidden = false;
      debugLog('Showing view:', viewKey);
      
      // Scroll to top when navigating to a new page
      // Use requestAnimationFrame to ensure DOM is updated first
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'instant' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        
        // Also scroll any scrollable containers to top
        const viewOutlet = document.getElementById('viewOutlet');
        if (viewOutlet) {
          viewOutlet.scrollTop = 0;
        }
      });
      
      // Update navigation highlighting
      this.updateNavigationHighlight(route);
      
      // Render the view if it has a render function
      if (this.views[viewKey] && typeof this.views[viewKey].render === 'function') {
        debugLog('Rendering view:', viewKey);
        const renderResult = this.views[viewKey].render();
        if (renderResult instanceof Promise) {
          renderResult.then(() => {
            // Scroll to top again after rendering is complete
            requestAnimationFrame(() => {
              window.scrollTo({ top: 0, behavior: 'instant' });
              document.documentElement.scrollTop = 0;
              document.body.scrollTop = 0;
              const viewOutlet = document.getElementById('viewOutlet');
              if (viewOutlet) {
                viewOutlet.scrollTop = 0;
              }
            });
          }).catch(() => {
            // Scroll to top even if render fails
            requestAnimationFrame(() => {
              window.scrollTo({ top: 0, behavior: 'instant' });
              document.documentElement.scrollTop = 0;
              document.body.scrollTop = 0;
            });
          });
        } else {
          // If render doesn't return a promise, scroll after a brief delay
          setTimeout(() => {
            window.scrollTo({ top: 0, behavior: 'instant' });
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
            const viewOutlet = document.getElementById('viewOutlet');
            if (viewOutlet) {
              viewOutlet.scrollTop = 0;
            }
          }, 100);
        }
      } else if (viewKey === 'today') {
        // Today view doesn't have a separate render function, it's handled by mainAppLogic
        debugLog('Today view - no additional rendering needed');
        // Scroll to top after a brief delay to ensure content is loaded
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'instant' });
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;
          const viewOutlet = document.getElementById('viewOutlet');
          if (viewOutlet) {
            viewOutlet.scrollTop = 0;
          }
        }, 100);
      }
    } else {
      console.error('View element not found for route:', route);
    }
  }
  
  updateNavigationHighlight(route: string): void {
    debugLog('Updating navigation highlight for route:', route);
    
    // Use a small delay to ensure DOM is ready
    setTimeout(() => {
      // Try multiple selectors to find nav items
      let navItems = document.querySelectorAll('nav a[data-route]');
      if (navItems.length === 0) {
        // Fallback: try to find nav items without data-route attribute
        navItems = document.querySelectorAll('nav a');
        debugLog('No items with data-route found, trying all nav links:', navItems.length);
      }
      
      debugLog('Found nav items:', navItems.length);
      
      // Remove active class from all nav items
      navItems.forEach(item => {
        item.classList.remove('active');
      });

      // Add active class to every matching tab. Multiple matches are expected:
      // both #todayView and the active period view each have a .period-tabs
      // strip in the DOM, and we want the visible one's tab highlighted.
      let activeItems = document.querySelectorAll(`nav a[data-route="${route}"]`);
      if (activeItems.length === 0) {
        activeItems = document.querySelectorAll(`nav a[href="#${route}"]`);
        debugLog('Trying href fallback for route:', `#${route}`);
      }

      if (activeItems.length > 0) {
        activeItems.forEach(item => item.classList.add('active'));
        debugLog('Highlighted', activeItems.length, 'nav item(s) for route:', route);
      } else {
        debugLog('No nav item found for route:', route);
      }
    }, 50);
  }
  
  registerView(key: string, view: { render: () => void | Promise<void> }): void {
    this.views[key] = view;
  }
}

