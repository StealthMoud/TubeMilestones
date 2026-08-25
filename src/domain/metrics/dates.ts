const REPORTING_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseReportingDay(day: string): Date {
  const match = REPORTING_DAY.exec(day);
  if (!match) throw new RangeError(`Invalid reporting day: ${day}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, date, 12));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== date
  ) {
    throw new RangeError(`Invalid reporting day: ${day}`);
  }

  return parsed;
}

export function formatReportingDay(
  day: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' },
): string {
  return new Intl.DateTimeFormat('en-US', {
    ...options,
    timeZone: 'UTC',
  }).format(parseReportingDay(day));
}

export function toReportingDay(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
