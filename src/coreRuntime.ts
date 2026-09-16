import { calculateTrendLine } from './chart/chart';

/**
 * Runtime globals every entry point needs, regardless of which page-specific
 * modules it pulls in:
 *  - debugLog/debugTime/debugTimeEnd, which several modules reference as a
 *    bare global (see their own `declare const debugLog` / the ambient
 *    `declare global` in types/index.ts) without importing anything.
 *  - TempHist.analytics, which api/temperature/client.ts optionally reports
 *    into via `window.TempHist?.analytics`.
 *  - calculateTrendLine, which chart.ts's updateChartTrendLine looks up via
 *    `globalThis.calculateTrendLine` instead of calling the local function in
 *    the same file — mirrors the assignment views/today/index.ts makes as a
 *    side effect of its own import, needed here explicitly because entries
 *    that don't pull in views/today (e.g. the share page) still render charts.
 */
export function initCoreRuntime(): void {
  globalThis.TempHist = globalThis.TempHist || ({} as typeof globalThis.TempHist);
  globalThis.TempHist.analytics = globalThis.TempHist.analytics || {
    errors: [],
    apiCalls: 0,
    apiFailures: 0,
    retryAttempts: 0,
    locationFailures: 0,
    startTime: Date.now(),
    lastRequestMetadata: null,
  };

  // NOTE: computed here (not passed in) so Vite's static import.meta.env.DEV
  // replacement applies within this module. A caller destructuring this value
  // out through a function return can't be proven `false` by Terser the way a
  // module-local `import.meta.env.DEV` literal can — see main.ts, which keeps
  // its own local DEBUGGING for exactly that reason (its dynamic
  // `import('./dev/testHooks')` needs to dead-code-eliminate in production).
  const DEBUGGING = import.meta.env.DEV || false;
  globalThis.DEBUGGING = DEBUGGING;
  globalThis.debugLog = (...args: any[]) => { if (DEBUGGING) console.log(...args); };
  globalThis.debugTime = (label: string) => { if (DEBUGGING) console.time(label); };
  globalThis.debugTimeEnd = (label: string) => { if (DEBUGGING) console.timeEnd(label); };

  globalThis.calculateTrendLine = calculateTrendLine;
}
