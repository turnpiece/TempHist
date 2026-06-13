import { INITIAL_LOADING_TEXT } from '../../constants/index';
import { setLocationCookie, getDisplayCity, getCountryCodeForLocation } from '../../utils/location';
import { updateDataNotice } from '../../utils/dataNotice';
import { Logger } from '../../utils/Logger';
import { Debouncer } from '../../utils/Debouncer';
import { buildLocationDisplay } from '../../utils/uiHelpers';
import { handleLocationChangeInternal } from '../../splash/splash';
import { fetchHistoricalData } from './fetchHistoricalData';

declare const debugLog: (...args: any[]) => void;

export function setupChangeLocationButton(periodKey: string = ''): void {
  const buttonId = periodKey ? `changeLocationBtn-${periodKey}` : 'changeLocationBtn';
  const changeLocationBtn = document.getElementById(buttonId);

  if (changeLocationBtn) {
    changeLocationBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handleChangeLocation();
    });
  }
}

function handleChangeLocation(): void {
  Logger.logUserInteraction('change_location_clicked');
  debugLog('Change location clicked, debouncing...');
  debouncedLocationChange();
}

const debouncedLocationChange = Debouncer.debounce(
  'location-change',
  () => {
    debugLog('Debounced location change triggered');
    handleLocationChangeInternal();
  },
  500,
  false
);

export function displayLocationAndFetchData(): void {
  debugLog('displayLocationAndFetchData called with globalThis.tempLocation:', globalThis.tempLocation);

  const isDefaultLocation = globalThis.tempLocationSource === 'default';
  const cityName = getDisplayCity(globalThis.tempLocation!);
  const locationDisplay = isDefaultLocation
    ? `${cityName} (default location)`
    : cityName;

  const locationTextElement = document.getElementById('locationText');
  if (locationTextElement) {
    locationTextElement.className = `location-heading location-${globalThis.tempLocationSource || 'unknown'}`;
    const countryCode = getCountryCodeForLocation(globalThis.tempLocation!);
    buildLocationDisplay(locationTextElement, locationDisplay, '', countryCode, !!globalThis.tempLocationIsDetected);
    setupChangeLocationButton();
  }

  const locationMessage = isDefaultLocation
    ? `📍 Using default location: <strong>${getDisplayCity(globalThis.tempLocation!)}</strong><br><small>Enable location permissions for your actual location</small>`
    : `📍 Location detected: <strong>${getDisplayCity(globalThis.tempLocation!)}</strong>`;

  updateDataNotice('', {
    debugOnly: true,
    useStructuredHtml: true,
    type: 'success',
    title: locationMessage,
    subtitle: INITIAL_LOADING_TEXT,
  });

  setLocationCookie(globalThis.tempLocation!, globalThis.tempLocationSource!, globalThis.tempLocationTimezone);

  fetchHistoricalData();
}
