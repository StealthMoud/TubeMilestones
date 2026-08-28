const STORAGE_PREFIX = 'tubemilestones:last-seen-snapshot:v1';

export const CHANNEL_UPDATE_VISIBLE_MS = 8_000;

export function channelUpdateStorageKey(channelId: string): string {
  return `${STORAGE_PREFIX}:${channelId}`;
}

export function readLastSeenSnapshot(channelId: string): string | null {
  try {
    return window.localStorage.getItem(channelUpdateStorageKey(channelId));
  } catch {
    return null;
  }
}

export function writeLastSeenSnapshot(channelId: string, observedAt: string): void {
  try {
    const key = channelUpdateStorageKey(channelId);
    const current = window.localStorage.getItem(key);
    const currentTime = current ? Date.parse(current) : Number.NaN;
    const nextTime = Date.parse(observedAt);
    if (!Number.isFinite(nextTime)) return;
    if (Number.isFinite(currentTime) && currentTime >= nextTime) return;
    window.localStorage.setItem(key, observedAt);
  } catch {
    // Storage may be unavailable in a private or constrained browser context.
  }
}
