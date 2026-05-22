export function getEffectiveDateForLocation(timezone?: string | null): {
  day: string;
  month: string;
  year: number;
} {
  const now = new Date();
  let dayNum: number, monthNum: number, yearNum: number, hour: number;

  if (timezone) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const get = (type: string) =>
      parseInt(parts.find(p => p.type === type)!.value, 10);
    yearNum = get('year');
    monthNum = get('month');
    dayNum = get('day');
    hour = get('hour');
  } else {
    yearNum = now.getFullYear();
    monthNum = now.getMonth() + 1;
    dayNum = now.getDate();
    hour = now.getHours();
  }

  // Before 6am at the location, use yesterday (matches iOS app behaviour)
  if (hour < 6) {
    const d = new Date(yearNum, monthNum - 1, dayNum);
    d.setDate(d.getDate() - 1);
    yearNum = d.getFullYear();
    monthNum = d.getMonth() + 1;
    dayNum = d.getDate();
  }

  // 29 Feb fallback — use 28 Feb for cross-year consistency
  if (dayNum === 29 && monthNum === 2) {
    dayNum = 28;
  }

  return {
    day: String(dayNum).padStart(2, '0'),
    month: String(monthNum).padStart(2, '0'),
    year: yearNum,
  };
}
