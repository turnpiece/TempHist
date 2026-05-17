/**
 * Format a day number as an ordinal (1st, 2nd, 3rd, …).
 * Shared by server.js and server-local.js for OG share headings.
 */
function getOrdinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

module.exports = { getOrdinal };
