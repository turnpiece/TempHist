/**
 * Re-export barrel for the today/ directory.
 * Vite resolves `import './today'` to today.ts before today/index.ts;
 * this shim keeps existing import paths working after the folder split.
 */
export { mainAppLogic, setupChangeLocationButton, fetchHistoricalData } from './today/index';
