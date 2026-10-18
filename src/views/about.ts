/**
 * About and Privacy page rendering
 */

import { renderImageAttributions } from '../services/locationCarousel';
import { resetTrendBackground } from '../utils/uiHelpers';

// ─── Shared DOM helper functions ────────────────────────────────────────────

function appendHeading(container: HTMLElement, text: string, level: 'h2' | 'h3' = 'h3'): void {
  const el = document.createElement(level);
  el.textContent = text;
  container.appendChild(el);
}

function appendParagraph(container: HTMLElement, text: string): HTMLParagraphElement {
  const el = document.createElement('p');
  el.textContent = text;
  container.appendChild(el);
  return el;
}

type ParagraphPart = string | { text: string; href: string };

const OPEN_METEO_LINK = { text: 'Open-Meteo', href: 'https://open-meteo.com' };
const COPERNICUS_LINK = { text: 'Copernicus Climate Change Service', href: 'https://climate.copernicus.eu' };
const NOMINATIM_LINK = { text: 'OpenStreetMap Nominatim', href: 'https://nominatim.org' };
const IPAPI_LINK = { text: 'ipapi.co', href: 'https://ipapi.co' };
const MAPBOX_LINK = { text: 'Mapbox', href: 'https://www.mapbox.com' };
const CLOUDFLARE_LINK = { text: 'Cloudflare', href: 'https://www.cloudflare.com' };
const RAILWAY_LINK = { text: 'Railway', href: 'https://railway.com' };
const GOOGLE_PRIVACY_LINK = { text: 'Privacy Policy', href: 'https://policies.google.com/privacy' };
const GOOGLE_TERMS_LINK = { text: 'Terms of Service', href: 'https://policies.google.com/terms' };

/** Append a paragraph made of plain text and external links, in order. */
function appendParagraphWithLinks(container: HTMLElement, parts: ParagraphPart[]): void {
  const p = document.createElement('p');
  parts.forEach(part => {
    if (typeof part === 'string') {
      p.appendChild(document.createTextNode(part));
      return;
    }
    const a = document.createElement('a');
    a.href = part.href;
    a.textContent = part.text;
    a.rel = 'noopener noreferrer';
    p.appendChild(a);
  });
  container.appendChild(p);
}

function appendBulletList(container: HTMLElement, items: string[]): void {
  const ul = document.createElement('ul');
  items.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    ul.appendChild(li);
  });
  container.appendChild(ul);
}

function appendSection(container: HTMLElement, headingText: string, bodyText: string): void {
  appendHeading(container, headingText);
  appendParagraph(container, bodyText);
}

function appendSectionWithLink(
  container: HTMLElement,
  headingText: string,
  beforeText: string,
  linkHref: string,
  linkText: string,
  afterText: string
): void {
  appendHeading(container, headingText);
  const p = document.createElement('p');
  p.appendChild(document.createTextNode(beforeText));
  const a = document.createElement('a');
  a.href = linkHref;
  a.textContent = linkText;
  a.rel = 'noopener noreferrer';
  p.appendChild(a);
  p.appendChild(document.createTextNode(afterText));
  container.appendChild(p);
}

// ─── Web Privacy Policy content ──────────────────────────────────────────────

/**
 * Build the website privacy policy content into the given container element.
 * Used by both the SPA view (#privacyView) and the standalone /privacy page.
 */
export function buildPrivacyWebContent(container: HTMLElement): void {
  appendHeading(container, 'Privacy Policy', 'h2');

  appendParagraph(container, 'Effective date: October 2026');

  appendParagraph(
    container,
    'TempHist, operated by Turnpiece Ltd., respects your privacy. This policy explains what data is collected when you use the TempHist website.'
  );

  // App users cross-reference
  const appNotePara = document.createElement('p');
  appNotePara.appendChild(document.createTextNode('Using the TempHist app? See the '));
  const appNoteLink = document.createElement('a');
  appNoteLink.href = '/privacy/app';
  appNoteLink.textContent = 'TempHist App Privacy Policy';
  appNotePara.appendChild(appNoteLink);
  appNotePara.appendChild(document.createTextNode('.'));
  container.appendChild(appNotePara);

  // Location data
  appendHeading(container, 'Location data');
  appendParagraph(
    container,
    'TempHist sends your location to the TempHist API (api.temphist.com) over an encrypted (HTTPS) connection to fetch temperature history for your area. For everyday browsing, only your city name is sent to the TempHist API. Your GPS coordinates are only sent to the TempHist API if you explicitly use the Share button (see ‘Share feature’ below). Your location is also stored in a browser cookie for up to one hour so the site remembers your preference between visits.'
  );
  appendParagraphWithLinks(container, [
    'To find the name of your city, the way your location is looked up depends on your browser settings. If you allow your browser to share your location, your device’s precise latitude and longitude are sent directly from your browser to ',
    NOMINATIM_LINK,
    ' to look up the nearest city, and that service also sees your IP address. If your location is unavailable or you decline to share it, your browser instead asks ',
    IPAPI_LINK,
    ' to approximate your location from your IP address. Your location data is never sold or used for advertising.',
  ]);

  // Anonymous authentication
  appendSection(
    container,
    'Anonymous authentication',
    'TempHist uses Firebase anonymous authentication. No account, email, name, or password is required. Each session is assigned an anonymous identifier (UID) used solely to authenticate requests to the TempHist API. This UID is not linked to any personal information. Firebase keeps this anonymous sign-in in your browser’s storage (IndexedDB or local storage) so that you stay signed in between visits, in addition to the cookies described under ‘Third-party services’ below.'
  );

  // Share feature
  appendSection(
    container,
    'Share feature',
    'If you use the Share button, your current location (including its GPS coordinates), chart data, and the city name are sent to the TempHist API to generate a shareable link. No additional personal data is included.'
  );

  // Anonymous diagnostics
  appendHeading(container, 'Anonymous diagnostics');
  appendParagraph(
    container,
    'To keep the site reliable, TempHist sends anonymous diagnostic information about each visit to the TempHist API. It is not linked to your identity and is used only to find and fix problems. It includes:'
  );
  appendBulletList(container, [
    'Session duration, and the number of API calls, failures, and retry attempts',
    'Error details, including sign-in and App Check failure codes',
    'App version, platform, and browser user agent',
    'An anonymous session ID',
    'The location you requested and the location it resolved to',
    'API response times',
  ]);
  appendParagraph(
    container,
    'This information is received by the TempHist API and kept for 7 days. The TempHist API does not store or log your IP address with it.'
  );

  // IP addresses
  appendHeading(container, 'IP addresses');
  appendParagraph(
    container,
    'The TempHist API uses your IP address only transiently, for short-lived rate-limit counters and abuse prevention. It is not stored in the anonymous diagnostics or in application logs. Your IP address is also processed by the infrastructure and third-party services listed below, which handle it under their own policies.'
  );

  // What is not collected
  appendHeading(container, 'What is not collected');
  appendBulletList(container, [
    'Personal identifiers such as name, email, or phone number',
    'Advertising data or advertising identifiers',
    'Cross-site tracking',
  ]);

  // Third-party services
  appendHeading(container, 'Third-party services');
  appendParagraph(
    container,
    'TempHist relies on the following third-party services, some of which receive information from your browser or from the TempHist API:'
  );
  appendParagraphWithLinks(container, [
    'Firebase (Google) provides anonymous authentication. Firebase may use cookies from Google services (identitytoolkit.googleapis.com and securetoken.googleapis.com) for authentication purposes only.',
  ]);
  appendParagraphWithLinks(container, [
    'Google reCAPTCHA v3, through Firebase App Check, helps protect the site from abuse. It runs in your browser and collects hardware and software information to tell people from bots. Google’s ',
    GOOGLE_PRIVACY_LINK,
    ' and ',
    GOOGLE_TERMS_LINK,
    ' apply.',
  ]);
  appendParagraphWithLinks(container, [
    NOMINATIM_LINK,
    ' and ',
    IPAPI_LINK,
    ' are used to work out your city name, as described under ‘Location data’.',
  ]);
  appendParagraphWithLinks(container, [
    'When you search for a city by name, your search text is sent via the TempHist API to ',
    MAPBOX_LINK,
    ' and Open-Meteo’s geocoding service to find matching places.',
  ]);
  appendParagraphWithLinks(container, [
    'Historical weather data (the ERA5 reanalysis from the ',
    COPERNICUS_LINK,
    ') is delivered by ',
    OPEN_METEO_LINK,
    ' and fetched via the TempHist API.',
  ]);
  appendParagraphWithLinks(container, [
    CLOUDFLARE_LINK,
    ' acts as a proxy and content delivery network in front of the website and the TempHist API, so it sees visitors’ IP addresses and requests, and provides Turnpiece with traffic analytics based on them, such as the countries and IP addresses requests come from. The website and API are hosted on ',
    RAILWAY_LINK,
    '.',
  ]);
  appendParagraph(
    container,
    'Cloudflare Web Analytics is also enabled on this website. It uses a small script to measure page views and page-load performance. It does not use cookies or local storage to do so, and does not fingerprint individual visitors.'
  );
  appendParagraph(
    container,
    'None of these services is used by TempHist for advertising or cross-site tracking. Some of them are operated by companies outside the UK, so your data may be processed in other countries.'
  );

  // Contact
  appendSectionWithLink(
    container,
    'Contact',
    'If you have any questions about this policy, please contact Turnpiece Ltd. at ',
    'https://turnpiece.com',
    'turnpiece.com',
    '.'
  );
}

// ─── App Privacy Policy content ─────────────────────────────────────────────

/**
 * Build the mobile app privacy policy content into the given container element.
 * Used by the standalone /privacy/app page.
 */
export function buildPrivacyAppContent(container: HTMLElement): void {
  appendHeading(container, 'App Privacy Policy', 'h2');

  appendParagraph(container, 'Effective date: October 2026');

  appendParagraph(
    container,
    'This policy covers the Temperature History (TempHist) mobile app, operated by Turnpiece Ltd. It explains what data the app collects, how it is used, and what is stored on your device.'
  );

  // Location data
  appendHeading(container, 'Location data');
  appendParagraph(
    container,
    'TempHist sends your location to the TempHist API (api.temphist.com) over an encrypted (HTTPS) connection so it can fetch temperature history for your area. For everyday use — viewing today\'s, weekly, monthly, or yearly temperature history — only your city name is sent to the TempHist API. Your GPS coordinates are only sent to the TempHist API if you explicitly tap the Share button (see ‘Share feature’ below) — simply selecting a location does not send your coordinates to the TempHist API. To support location history and reduce repeated lookups, the app stores on your device the detected city name and up to 10 recent GPS locations in app storage (SharedPreferences). This data is cleared only when the app is uninstalled.'
  );
  appendParagraph(
    container,
    'To turn your device\'s coordinates into a city name, the app uses your operating system\'s built-in geocoding service. On iOS and Android this is typically a request to Apple or Google, which therefore receives your precise coordinates, under their own privacy policies. Your location is never sold or used for advertising.'
  );

  // Anonymous authentication
  appendSection(
    container,
    'Anonymous authentication',
    'TempHist uses Firebase anonymous authentication. No account, email, name, or password is required or collected. Each session is assigned an anonymous identifier (UID) used solely to authenticate requests to the TempHist API.'
  );

  // Data stored on device
  appendHeading(container, 'Data stored on your device');
  appendParagraph(container, 'The following data is stored locally on your device:');
  appendBulletList(container, [
    'Detected city name — stored until the app is uninstalled',
    'Up to 10 recent GPS locations — stored until the app is uninstalled',
    'Temperature data — cached for up to 7 days',
    'Unit preference (°C or °F) — stored until the app is uninstalled',
    'Onboarding state — stored until the app is uninstalled',
  ]);

  // Share feature
  appendSection(
    container,
    'Share feature',
    'If you use the Share button, your current location (including its GPS coordinates), chart data, and the city name are posted to api.temphist.com/v1/shares to generate a shareable link. No additional personal data is included.'
  );

  // Anonymous analytics and diagnostics
  appendHeading(container, 'Analytics and diagnostics');
  appendParagraph(
    container,
    'The app sends the following anonymous information, which is not linked to your identity and is used only to understand how the app is used and to find and fix problems:'
  );
  appendBulletList(container, [
    'Usage events sent to the TempHist API: the location you requested, how that location was chosen, your platform, and basic session and error diagnostics. The API keeps these for 7 days.',
    'Crash reports and error diagnostics sent to Firebase Crashlytics (Google): stack traces, device and operating system information, an installation identifier, and, if app attestation fails, the platform, provider, and error code. Crashlytics is only active in release builds. Google retains this data under its own policies.',
  ]);

  // App attestation
  appendHeading(container, 'App attestation');
  appendParagraph(
    container,
    'To protect the TempHist API from abuse, the app uses Firebase App Check to confirm that requests come from a genuine copy of the app. On Android this uses Google Play Integrity, and on iOS it uses Apple DeviceCheck / App Attest. Device and app integrity information is exchanged with Google or Apple for this purpose, under their own privacy policies.'
  );

  // IP addresses
  appendHeading(container, 'IP addresses');
  appendParagraph(
    container,
    'The TempHist API uses your IP address only transiently, for short-lived rate-limit counters and abuse prevention. It is not stored in the analytics events or in application logs. Your IP address is also processed by the infrastructure and third-party services listed below, which handle it under their own policies.'
  );

  // What is not collected
  appendHeading(container, 'What is not collected');
  appendBulletList(container, [
    'Personal identifiers such as name, email, or phone number',
    'Advertising data or advertising identifiers',
    'Cross-site tracking',
  ]);

  // Third-party services
  appendHeading(container, 'Third-party services');
  appendParagraph(
    container,
    'TempHist relies on the following third-party services, some of which receive information from the app or from the TempHist API:'
  );
  appendParagraph(
    container,
    'Firebase (Google) provides anonymous authentication, App Check, and Crashlytics crash reporting.'
  );
  appendParagraph(
    container,
    'Apple and Google provide your device\'s geocoding service and the app attestation services described above.'
  );
  appendParagraphWithLinks(container, [
    'When you search for a city by name, your search text is sent via the TempHist API to ',
    MAPBOX_LINK,
    ' and Open-Meteo’s geocoding service to find matching places.',
  ]);
  appendParagraphWithLinks(container, [
    'Historical weather data (the ERA5 reanalysis from the ',
    COPERNICUS_LINK,
    ') is delivered by ',
    OPEN_METEO_LINK,
    ' and fetched via the TempHist API.',
  ]);
  appendParagraphWithLinks(container, [
    CLOUDFLARE_LINK,
    ' acts as a proxy and content delivery network in front of the TempHist API, so it sees your IP address and requests, and provides Turnpiece with traffic analytics based on them, such as the countries and IP addresses requests come from. The API is hosted on ',
    RAILWAY_LINK,
    '.',
  ]);
  appendParagraph(
    container,
    'None of these services is used by TempHist for advertising or cross-site tracking. Some of them are operated by companies outside the UK, so your data may be processed in other countries.'
  );

  // Contact
  appendSectionWithLink(
    container,
    'Contact',
    'If you have any questions about this policy, please contact Turnpiece Ltd. at ',
    'https://turnpiece.com',
    'turnpiece.com',
    '.'
  );
}

// ─── SPA Page Renderers ──────────────────────────────────────────────────────

// ─── About page content ──────────────────────────────────────────────────────

/**
 * Build the About page content into the given container element.
 * Used by the standalone /about page.
 */
export function buildAboutContent(container: HTMLElement): void {
  appendHeading(container, 'About TempHist', 'h2');

  appendParagraph(
    container,
    'TempHist shows 50 years of temperature history for your location across four time periods: today, the past week, the past month, and the past year.'
  );

  // How it works
  appendHeading(container, 'How it works');
  appendParagraph(
    container,
    'Each view shows a bar chart with one bar per year. Warmer years are red, cooler years are blue.'
  );

  // Period list (plain text — these describe in-app views, not standalone
  // pages, so they shouldn't link out from this page)
  const periodItems: Array<{ label: string; description: string }> = [
    { label: 'Today',      description: ' — the average temperature on today\'s date, in each of the past 50 years' },
    { label: 'Past week',  description: ' — the average temperature for the 7 days ending today, in each of the past 50 years' },
    { label: 'Past month', description: ' — the average temperature for the 31 days ending today, in each of the past 50 years' },
    { label: 'Past year',  description: ' — the average temperature for the 365 days ending today, in each of the past 50 years' },
  ];

  const ul = document.createElement('ul');
  periodItems.forEach(({ label, description }) => {
    const li = document.createElement('li');
    const strong = document.createElement('strong');
    strong.textContent = label;
    li.appendChild(strong);
    li.appendChild(document.createTextNode(description));
    ul.appendChild(li);
  });
  container.appendChild(ul);

  appendParagraph(
    container,
    'Each chart also shows an average line (the mean across all years) and a trend line (showing whether temperatures have been rising or falling over time).'
  );

  // Data sources
  appendHeading(container, 'Data sources');
  appendParagraphWithLinks(container, [
    'The temperatures are the ERA5 reanalysis, produced by ECMWF for the ',
    COPERNICUS_LINK,
    ' and delivered through ',
    OPEN_METEO_LINK,
    ' via the TempHist API. The record starts in 1940.',
  ]);
  appendParagraph(
    container,
    'A reanalysis re-runs a weather model over past decades so that it agrees with the observations available at the time (stations, ships, balloons and satellites). The result is a complete, consistent record with no gaps.'
  );
  appendParagraph(
    container,
    'The values are modelled estimates of the daily mean air temperature for a grid cell about 25 km across, not readings from a single weather station. They can differ from official station records, especially in cities, on coasts and in hills.'
  );
  appendParagraph(
    container,
    'The newest few days come from Open-Meteo\'s forecast model, which is a different model, so today\'s figure can sit slightly above or below the history it is compared with.'
  );
  appendParagraphWithLinks(container, [
    'Weather data by ',
    { text: 'Open-Meteo.com', href: 'https://open-meteo.com' },
    ', licensed under ',
    { text: 'CC BY 4.0', href: 'https://creativecommons.org/licenses/by/4.0/' },
    '. Generated using Copernicus Climate Change Service information 2022. Data set: Hersbach, H. et al. (2023). ',
    { text: 'ERA5 hourly data on single levels from 1940 to present', href: 'https://doi.org/10.24381/cds.adbb2d47' },
    '. ECMWF.',
  ]);

  // How the numbers are made
  appendHeading(container, 'How the numbers are made');
  appendParagraph(
    container,
    'For the date you are viewing, each of the last 51 years (this year and the 50 before it) gets a single value: the mean of the daily temperatures in a window that ends on that date. That window is the date itself for Today, the 7 days ending on it for Past week, the 31 days ending on it for Past month, and the 365 days ending on it for Past year.'
  );
  appendBulletList(container, [
    'The average line is the mean of those yearly values.',
    'The trend line is a straight-line fit through the yearly values, shown in °C (or °F) per decade with a margin of error.',
  ]);
  appendParagraph(
    container,
    'Past year is the steadiest view, because a full year of days smooths out the weather. A single date is noisy, so its trend has a wide margin of error. Either way, a trend describes the past; it is not a forecast.'
  );

  // Contact
  appendSectionWithLink(
    container,
    'Contact',
    'TempHist is a Turnpiece project. For questions or feedback, please visit ',
    'https://turnpiece.com',
    'turnpiece.com',
    '.'
  );
}

/**
 * Render the About page content into the #aboutView SPA section.
 */
export function renderAboutPage(): void {
  resetTrendBackground();
  const aboutView = document.getElementById('aboutView');
  if (!aboutView) return;

  aboutView.textContent = '';

  const container = document.createElement('div');
  container.className = 'container';

  buildAboutContent(container);

  renderImageAttributions(container).catch(error => {
    console.warn('Failed to render image attributions:', error);
  });

  aboutView.appendChild(container);
}

/**
 * Render the website privacy policy into the #privacyView SPA section.
 */
export function renderPrivacyPage(): void {
  resetTrendBackground();
  const privacyView = document.getElementById('privacyView');
  if (!privacyView) return;

  privacyView.textContent = '';

  const container = document.createElement('div');
  container.className = 'container';

  buildPrivacyWebContent(container);

  privacyView.appendChild(container);
}

/**
 * Render the mobile app privacy policy into the standalone /privacy/app page's #content element.
 */
export function renderPrivacyAppPage(): void {
  resetTrendBackground();
  const content = document.getElementById('content');
  if (!content) return;

  content.textContent = '';

  const container = document.createElement('div');
  container.className = 'container';

  buildPrivacyAppContent(container);

  content.appendChild(container);
}
