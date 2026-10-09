export function dateKeyInTimeZone(value, timeZone = 'UTC') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Cannot group an invalid click timestamp.');
  }

  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
  } catch (error) {
    throw new Error(`Invalid analytics time zone: ${timeZone}`, { cause: error });
  }
  const values = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  return `${values.year}-${values.month}-${values.day}`;
}
