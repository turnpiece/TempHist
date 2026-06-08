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

  appendParagraph(container, 'Effective date: March 2026');

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
    'TempHist sends your location to the TempHist API (api.temphist.com) over an encrypted (HTTPS) connection to fetch temperature history for your area. For everyday browsing, only your city name is sent — your GPS coordinates stay on your device. Your GPS coordinates are only ever transmitted if you explicitly use the Share button (see ‘Share feature’ below). This data is never sold, used for advertising, or shared with third parties for tracking. Your location is also stored in a browser cookie for up to one hour so the site remembers your preference between visits.'
  );

  // Anonymous authentication
  appendSection(
    container,
    'Anonymous authentication',
    'TempHist uses Firebase anonymous authentication. No account, email, name, or password is required. Each session is assigned an anonymous identifier (UID) used solely to authenticate requests to the TempHist API. This UID is not linked to any personal information.'
  );

  // Share feature
  appendSection(
    container,
    'Share feature',
    'If you use the Share button, your current location (including its GPS coordinates), chart data, and the city name are sent to the TempHist API to generate a shareable link. No additional personal data is included.'
  );

  // What is not collected
  appendHeading(container, 'What is not collected');
  appendBulletList(container, [
    'Personal identifiers such as name, email, or phone number',
    'Analytics or advertising data',
    'Cross-site tracking',
  ]);

  // Third-party services
  appendSection(
    container,
    'Third-party services',
    'TempHist uses Firebase (Google) for anonymous authentication. Firebase may use cookies from Google services (identitytoolkit.googleapis.com and securetoken.googleapis.com) for authentication purposes only. Historical weather data is sourced via the TempHist API from Open-Meteo. Neither service is used for advertising or cross-site tracking.'
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

  appendParagraph(container, 'Effective date: March 2026');

  appendParagraph(
    container,
    'This policy covers the Temperature History (TempHist) mobile app, operated by Turnpiece Ltd. It explains what data the app collects, how it is used, and what is stored on your device.'
  );

  // Location data
  appendHeading(container, 'Location data');
  appendParagraph(
    container,
    'TempHist sends your location to the TempHist API (api.temphist.com) over an encrypted (HTTPS) connection so it can fetch temperature history for your area. For everyday use — viewing today\'s, weekly, monthly, or yearly temperature history — only your city name is sent; your precise GPS coordinates stay on your device. Your GPS coordinates are only ever transmitted if you explicitly tap the Share button (see ‘Share feature’ below) — simply selecting a location does not send your coordinates anywhere. This data is never sold, used for advertising, or shared with third parties for tracking. To support location history and reduce repeated lookups, the app stores on your device the detected city name and up to 10 recent GPS locations in app storage (SharedPreferences). This data is cleared only when the app is uninstalled.'
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

  // What is not collected
  appendHeading(container, 'What is not collected');
  appendBulletList(container, [
    'Personal identifiers such as name, email, or phone number',
    'Analytics or advertising data',
    'Cross-site tracking',
  ]);

  // Third-party services
  appendSection(
    container,
    'Third-party services',
    'TempHist uses Firebase (Google) for anonymous authentication. Historical weather data is sourced via the TempHist API from Open-Meteo. Neither service is used for advertising or cross-site tracking.'
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
    'Each view shows a bar chart with one bar per year. The current year\'s bar is highlighted in green.'
  );

  // Period list (plain text — these describe in-app views, not standalone
  // pages, so they shouldn't link out from this page)
  const periodItems: Array<{ label: string; description: string }> = [
    { label: 'Today',      description: ' — the temperature recorded on today\'s date, in each of the past 50 years' },
    { label: 'Past week',  description: ' — the average temperature for the 7 days ending today, in each of the past 50 years' },
    { label: 'Past month', description: ' — the average temperature for the 30 days ending today, in each of the past 50 years' },
    { label: 'Past year',  description: ' — the average temperature for the 12 months ending today, in each of the past 50 years' },
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
  const dataSourcesPara = document.createElement('p');
  dataSourcesPara.textContent = 'Historical weather data is sourced from ';
  /*
  const sourceLink = document.createElement('a');
  sourceLink.href = 'https://www.visualcrossing.com';
  sourceLink.textContent = 'Visual Crossing';
  */
  const sourceLink = document.createElement('a');
  sourceLink.href = 'https://open-meteo.com';
  sourceLink.textContent = 'Open-Meteo';
  sourceLink.rel = 'noopener noreferrer';
  dataSourcesPara.appendChild(sourceLink);
  dataSourcesPara.appendChild(document.createTextNode(' via the TempHist API.'));
  container.appendChild(dataSourcesPara);

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
