/**
 * Info button + expandable note for the stats bubble (average / trend / standard
 * deviation). Keeps the stats lines short while still answering "what does the ±
 * mean?" for people who want to know. The note links to the About page's
 * "How certain is the trend?" section.
 */

export const TREND_CERTAINTY_HREF = '/about#trend-certainty';

let noteCounter = 0;

/**
 * Add an info button and a collapsed explanatory note to a stats bubble.
 * Safe to call more than once on the same bubble.
 */
export function attachStatsInfo(bubble: HTMLElement | null): void {
  if (!bubble || bubble.querySelector('.stats-info-btn')) return;

  const noteId = `statsInfoNote${++noteCounter}`;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'stats-info-btn';
  button.setAttribute('aria-label', 'What do these numbers mean?');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', noteId);
  button.textContent = 'i';

  const note = document.createElement('div');
  note.id = noteId;
  note.className = 'stats-info-note';
  note.hidden = true;

  const average = document.createElement('p');
  average.textContent =
    'Average: the mean of the 51 yearly values in the chart, including this year\'s.';
  const trend = document.createElement('p');
  trend.textContent =
    'Trend: how fast temperatures are changing per decade. The ± is how uncertain that figure is (one standard error). If the trend is smaller than about twice its ±, it can\'t be told apart from no trend.';
  const spread = document.createElement('p');
  spread.textContent =
    'Standard deviation: how much the yearly figures typically vary from the average.';
  const more = document.createElement('p');
  const link = document.createElement('a');
  link.href = TREND_CERTAINTY_HREF;
  link.textContent = 'More about the numbers';
  more.appendChild(link);

  note.append(average, trend, spread, more);

  button.addEventListener('click', () => {
    const expanding = note.hidden;
    note.hidden = !expanding;
    button.setAttribute('aria-expanded', String(expanding));
  });

  bubble.append(button, note);
}
