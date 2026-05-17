import { DEFAULT_LOCATION, INITIAL_LOADING_TEXT } from '../../constants/index';
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
  debugLog('displayLocationAndFetchData called with window.tempLocation:', window.tempLocation);

  const isDefaultLocation = window.tempLocationSource === 'default';
  const cityName = getDisplayCity(window.tempLocation!);
  const locationDisplay = isDefaultLocation
    ? `${cityName} (default location)`
    : cityName;

  const locationTextElement = document.getElementById('locationText');
  if (locationTextElement) {
    locationTextElement.className = `location-heading location-${window.tempLocationSource || 'unknown'}`;
    const countryCode = getCountryCodeForLocation(window.tempLocation!);
    buildLocationDisplay(locationTextElement, locationDisplay, '', countryCode);
    setupChangeLocationButton();
  }

  const locationMessage = isDefaultLocation
    ? `📍 Using default location: <strong>${getDisplayCity(window.tempLocation!)}</strong><br><small>Enable location permissions for your actual location</small>`
    : `📍 Location detected: <strong>${getDisplayCity(window.tempLocation!)}</strong>`;

  updateDataNotice('', {
    debugOnly: true,
    useStructuredHtml: true,
    type: 'success',
    title: locationMessage,
    subtitle: INITIAL_LOADING_TEXT,
  });

  setLocationCookie(window.tempLocation!, window.tempLocationSource!);

  fetchHistoricalData();
}
