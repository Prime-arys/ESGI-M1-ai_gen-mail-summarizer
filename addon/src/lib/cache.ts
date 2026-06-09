import { storage } from '#imports';
import type { MailSummary, ProviderId } from '@/lib/types';

/**
 * Cache temporaire des derniers résumés, par provider, dans `storage.local`.
 * Au-delà de TTL_MS on considère le cache stale et on revient au bouton "Résumer".
 */
const TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CachedEntry {
  summaries: MailSummary[];
  cachedAt: number;
}

const key = (p: ProviderId) => `local:summaries_${p}` as const;

export async function loadCachedSummaries(p: ProviderId): Promise<MailSummary[] | null> {
  const entry = await storage.getItem<CachedEntry>(key(p));
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > TTL_MS) {
    await storage.removeItem(key(p));
    return null;
  }
  return entry.summaries;
}

export async function saveCachedSummaries(p: ProviderId, summaries: MailSummary[]): Promise<void> {
  const entry: CachedEntry = { summaries, cachedAt: Date.now() };
  await storage.setItem<CachedEntry>(key(p), entry);
}

export async function clearCachedSummaries(p: ProviderId): Promise<void> {
  await storage.removeItem(key(p));
}
