export function dateKeyInTimeZone(value, timeZone) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Cannot group an invalid click timestamp.');
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  return `${values.year}-${values.month}-${values.day}`;
}
