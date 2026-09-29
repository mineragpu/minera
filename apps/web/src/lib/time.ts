const relative = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });

const STEPS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 30],
  ['month', 12],
  ['year', Number.POSITIVE_INFINITY],
];

/** "3 minutes ago", "in 2 hours", "now". */
export function timeFromNow(date: Date, now: number = Date.now()): string {
  let amount = (date.getTime() - now) / 1000;
  for (const [unit, size] of STEPS) {
    if (Math.abs(amount) < size) return relative.format(Math.round(amount), unit);
    amount /= size;
  }
  return relative.format(Math.round(amount), 'year');
}

/** A date and time in the visitor's own time zone. */
export function formatDateTime(date: Date): string {
  return date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}
