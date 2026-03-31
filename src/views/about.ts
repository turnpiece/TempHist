/**
 * About and Privacy page rendering
 */

import { renderImageAttributions } from '../services/locationCarousel';

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
    'When you use TempHist, your city-level location is included in every request sent to the TempHist API (api.temphist.com). Only the city name is transmitted — no precise GPS coordinates are stored or shared. Your location is also stored in a browser cookie for up to one hour so the app remembers your preference between visits. Location data in transit is linked to your anonymous session identifier (see below).'
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
    'If you use the Share button, your current location and chart data are sent to api.temphist.com/v1/shares to generate a shareable link. No additional personal data is included.'
  );

  // What is not collected
  appendHeading(container, 'What is not collected');
  appendBulletList(container, [
    'Precise GPS coordinates',
    'Personal identifiers such as name, email, or phone number',
    'Analytics or advertising data',
    'Cross-site tracking',
  ]);

  // Third-party services
  appendSection(
    container,
    'Third-party services',
    'TempHist uses Firebase (Google) for anonymous authentication. Firebase may use cookies from Google services (identitytoolkit.googleapis.com and securetoken.googleapis.com) for authentication purposes only. Historical weather data is sourced via the TempHist API from Visual Crossing. Neither service is used for advertising or cross-site tracking.'
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
    'This policy covers the TempHist mobile app, operated by Turnpiece Ltd. It explains what data the app collects, how it is used, and what is stored on your device.'
  );

  // Location data
  appendHeading(container, 'Location data');
  appendParagraph(
    container,
    'When you use TempHist, your city-level location is included in every request sent to the TempHist API (api.temphist.com). This is the city name obtained by reverse-geocoding your device location — no precise GPS coordinates are stored or transmitted. Location is linked to your anonymous session identifier in each request. Your location is cached on-device for 30 minutes to reduce repeated lookups.'
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
    'Your city-level location — cached for 30 minutes',
    'Temperature data — cached for up to 7 days',
    'Unit preference (°C or °F) — stored until the app is uninstalled',
    'Onboarding state — stored until the app is uninstalled',
  ]);

  // Share feature
  appendSection(
    container,
    'Share feature',
    'If you use the Share button, your current location and chart data are posted to api.temphist.com/v1/shares to generate a shareable link. No additional personal data is included.'
  );

  // What is not collected
  appendHeading(container, 'What is not collected');
  appendBulletList(container, [
    'Precise GPS coordinates — only the reverse-geocoded city name is used',
    'Personal identifiers such as name, email, or phone number',
    'Analytics or advertising data',
    'Cross-site tracking',
  ]);

  // Third-party services
  appendSection(
    container,
    'Third-party services',
    'TempHist uses Firebase (Google) for anonymous authentication. Historical weather data is sourced via the TempHist API from Visual Crossing. Neither service is used for advertising or cross-site tracking.'
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
 * Used by both the SPA view (#aboutView) and the standalone /about page.
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
    'Each view shows a bar chart with one bar per year — swipe or tap to move between time periods. The current year\'s bar is highlighted in green.'
  );

  appendBulletList(container, [
    'Today — the temperature recorded on today\'s date, in each of the past 50 years',
    'Past week — the average temperature for the 7 days ending today, in each of the past 50 years',
    'Past month — the average temperature for the 30 days ending today, in each of the past 50 years',
    'Past year — the average temperature for the 12 months ending today, in each of the past 50 years',
  ]);

  appendParagraph(
    container,
    'Each chart also shows an average line (the mean across all years) and a trend line (showing whether temperatures have been rising or falling over time).'
  );

  // Data sources
  appendHeading(container, 'Data sources');
  const dataSourcesPara = document.createElement('p');
  dataSourcesPara.textContent = 'Historical weather data is sourced from ';
  const vcLink = document.createElement('a');
  vcLink.href = 'https://www.visualcrossing.com';
  vcLink.textContent = 'Visual Crossing';
  vcLink.rel = 'noopener noreferrer';
  dataSourcesPara.appendChild(vcLink);
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
  const privacyView = document.getElementById('privacyView');
  if (!privacyView) return;

  privacyView.textContent = '';

  const container = document.createElement('div');
  container.className = 'container';

  buildPrivacyWebContent(container);

  privacyView.appendChild(container);
}
