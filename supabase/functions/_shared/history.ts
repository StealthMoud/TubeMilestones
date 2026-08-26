import type { ArchiveAnalyticsRow, ArchiveSnapshotRow } from './archive.ts';

export function mergeAnalyticsHistory(
  archived: readonly ArchiveAnalyticsRow[],
  hot: readonly ArchiveAnalyticsRow[],
): ArchiveAnalyticsRow[] {
  const byDay = new Map(archived.map((row) => [row.day, row]));
  for (const row of hot) byDay.set(row.day, row);
  return [...byDay.values()].sort((left, right) => left.day.localeCompare(right.day));
}

export function mergeSnapshotHistory(
  archived: readonly ArchiveSnapshotRow[],
  hot: readonly ArchiveSnapshotRow[],
): ArchiveSnapshotRow[] {
  const byDay = new Map(archived.map((row) => [row.snapshotDate, row]));
  for (const row of hot) byDay.set(row.snapshotDate, row);
  return [...byDay.values()].sort((left, right) =>
    left.snapshotDate.localeCompare(right.snapshotDate),
  );
}

export function requestedStartDate(
  range: '7D' | '28D' | '90D' | '365D' | 'ALL',
  endDate: string,
  earliest: string,
): string {
  if (range === 'ALL') return earliest;
  const days = Number.parseInt(range, 10);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() - (days - 1));
  return end.toISOString().slice(0, 10);
}
