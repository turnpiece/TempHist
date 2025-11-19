/**
 * About and Privacy page rendering
 */

import { renderImageAttributions } from '../services/locationCarousel';

/**
 * Create data sources section elements
 */
function createDataSourcesSection(includeAnonymousNote: boolean = false): { title: HTMLHeadingElement; text: HTMLParagraphElement } {
  const dataSourcesTitle = document.createElement('h3');
  dataSourcesTitle.textContent = 'Data sources';
  
  const dataSourcesText = document.createElement('p');
  dataSourcesText.textContent = 'Weather and climate data are provided via the TempHist API, which sources historical weather data from ';
  
  const dataSourcesLink = document.createElement('a');
  dataSourcesLink.href = 'https://www.visualcrossing.com';
  dataSourcesLink.textContent = 'Visual Crossing';
  dataSourcesLink.rel = 'noopener noreferrer';
  dataSourcesText.appendChild(dataSourcesLink);
  
  const endingText = includeAnonymousNote ? '. Requests are processed anonymously.' : '.';
  dataSourcesText.appendChild(document.createTextNode(endingText));
  
  return { title: dataSourcesTitle, text: dataSourcesText };
}

/**
 * Create cookie usage text paragraph element
 */
function createCookieUsageText(): HTMLParagraphElement {
  const cookieUsageText = document.createElement('p');
  const strongText = document.createElement('strong');
  strongText.textContent = 'Third-party cookie usage:';
  cookieUsageText.appendChild(strongText);
  cookieUsageText.appendChild(document.createTextNode(' Firebase authentication may use third-party cookies to maintain your anonymous session. These cookies are essential for the app\'s authentication functionality and are not used for advertising or tracking purposes.'));
  
  return cookieUsageText;
}

/**
 * Create "No personal data collected" section elements
 */
function createNoPersonalDataSection(): { title: HTMLHeadingElement; text: HTMLParagraphElement } {
  const noDataTitle = document.createElement('h3');
  noDataTitle.textContent = 'No personal data collected';
  const noDataText = document.createElement('p');
  noDataText.textContent = 'TempHist does not collect, store, or share any personal information.';
  
  return { title: noDataTitle, text: noDataText };
}

/**
 * Create "Location use" section elements
 */
function createLocationUseSection(): { title: HTMLHeadingElement; text: HTMLParagraphElement } {
  const locationTitle = document.createElement('h3');
  locationTitle.textContent = 'Location use';
  const locationText = document.createElement('p');
  locationText.textContent = 'If you grant permission, the app uses your current location once to retrieve historical weather data for your area. Location data is never shared but is temporarily stored in a cookie on your machine for one hour.';
  
  return { title: locationTitle, text: locationText };
}

/**
 * Create "Third-party services and cookies" section elements
 */
function createThirdPartyServicesSection(): { title: HTMLHeadingElement; text: HTMLParagraphElement } {
  const thirdPartyTitle = document.createElement('h3');
  thirdPartyTitle.textContent = 'Third-party services and cookies';
  const thirdPartyText = document.createElement('p');
  thirdPartyText.textContent = 'TempHist uses Firebase for anonymous authentication, which may set third-party cookies from Google services (including identitytoolkit.googleapis.com and securetoken.googleapis.com). These cookies are used solely for authentication purposes and do not track personal information or enable cross-site tracking.';
  
  return { title: thirdPartyTitle, text: thirdPartyText };
}

/**
 * Create "No tracking or analytics" section elements
 */
function createNoTrackingSection(): { title: HTMLHeadingElement; text: HTMLParagraphElement } {
  const noTrackingTitle = document.createElement('h3');
  noTrackingTitle.textContent = 'No tracking or analytics';
  const noTrackingText = document.createElement('p');
  noTrackingText.textContent = 'The app does not include analytics, advertising or third-party tracking beyond the authentication service mentioned above. We do not use cookies for tracking, advertising, or cross-site user profiling.';
  
  return { title: noTrackingTitle, text: noTrackingText };
}

/**
 * Create "Contact" section elements (privacy page variant)
 */
function createContactSectionPrivacy(): { title: HTMLHeadingElement; text: HTMLParagraphElement } {
  const contactTitle = document.createElement('h3');
  contactTitle.textContent = 'Contact';
  const contactText = document.createElement('p');
  contactText.textContent = 'If you have questions, please contact Turnpiece Ltd. at ';
  const contactLink = document.createElement('a');
  contactLink.href = 'https://turnpiece.com';
  contactLink.textContent = 'https://turnpiece.com';
  contactLink.rel = 'noopener noreferrer';
  contactText.appendChild(contactLink);
  contactText.appendChild(document.createTextNode('.'));
  
  return { title: contactTitle, text: contactText };
}

/**
 * Render the About page content
 */
export function renderAboutPage(): void {
  const aboutView = document.getElementById('aboutView');
  if (!aboutView) return;

  // Clear existing content
  aboutView.textContent = '';

  // Create container
  const container = document.createElement('div');
  container.className = 'container';

  // Create elements safely
  const title = document.createElement('h2');
  title.textContent = 'About TempHist';

  const intro = document.createElement('p');
  intro.textContent = 'TempHist shows you how today\'s temperature compares to the same date over the past 50 years. It can also compare this past week, month or year with the same period over the past 50 years.';

  const howItWorksTitle = document.createElement('h3');
  howItWorksTitle.textContent = 'How it works';
  const howItWorksText = document.createElement('p');
  howItWorksText.textContent = 'TempHist uses your location to fetch historical weather data and displays it in an easy-to-read chart. Each bar represents the temperature on this date, or this past week/month/year, in a different year, with the current year highlighted in green.';

  const { title: dataSourcesTitle, text: dataSourcesText } = createDataSourcesSection(false);

  const contactTitle = document.createElement('h3');
  contactTitle.textContent = 'Contact';
  const contactText = document.createElement('p');
  contactText.textContent = 'TempHist is a Turnpiece project. For questions or feedback, please visit ';
  const contactLink = document.createElement('a');
  contactLink.href = 'https://turnpiece.com';
  contactLink.textContent = 'turnpiece.com';
  contactLink.rel = 'noopener noreferrer';
  contactText.appendChild(contactLink);
  contactText.appendChild(document.createTextNode('.'));

  // Append all elements
  container.appendChild(title);
  container.appendChild(intro);
  container.appendChild(howItWorksTitle);
  container.appendChild(howItWorksText);
  container.appendChild(dataSourcesTitle);
  container.appendChild(dataSourcesText);
  container.appendChild(contactTitle);
  container.appendChild(contactText);

  // Add image attributions section (async, will append when ready)
  renderImageAttributions(container).catch(error => {
    console.warn('Failed to render image attributions:', error);
  });

  aboutView.appendChild(container);
}

/**
 * Render the Privacy page content
 */
export function renderPrivacyPage(): void {
  const privacyView = document.getElementById('privacyView');
  if (!privacyView) return;

  // Clear existing content
  privacyView.textContent = '';

  // Create container
  const container = document.createElement('div');
  container.className = 'container';

  // Create elements safely
  const title = document.createElement('h2');
  title.textContent = 'Privacy Policy';

  const effectiveDate = document.createElement('p');
  effectiveDate.textContent = 'Effective date: September 2025';

  const intro = document.createElement('p');
  intro.textContent = 'TempHist, operated by Turnpiece Ltd., respects your privacy.';

  // No personal data section
  const { title: noDataTitle, text: noDataText } = createNoPersonalDataSection();

  // Location use section
  const { title: locationTitle, text: locationText } = createLocationUseSection();

  // Third-party services section
  const { title: thirdPartyTitle, text: thirdPartyText } = createThirdPartyServicesSection();
  const cookieUsageText = createCookieUsageText();

  // No tracking section
  const { title: noTrackingTitle, text: noTrackingText } = createNoTrackingSection();

  // Data sources section
  const { title: dataSourcesTitle, text: dataSourcesText } = createDataSourcesSection(true);

  // Contact section
  const { title: contactTitle, text: contactText } = createContactSectionPrivacy();

  // Append all elements
  container.appendChild(title);
  container.appendChild(effectiveDate);
  container.appendChild(intro);
  container.appendChild(noDataTitle);
  container.appendChild(noDataText);
  container.appendChild(locationTitle);
  container.appendChild(locationText);
  container.appendChild(thirdPartyTitle);
  container.appendChild(thirdPartyText);
  container.appendChild(cookieUsageText);
  container.appendChild(noTrackingTitle);
  container.appendChild(noTrackingText);
  container.appendChild(dataSourcesTitle);
  container.appendChild(dataSourcesText);
  container.appendChild(contactTitle);
  container.appendChild(contactText);

  privacyView.appendChild(container);
}

