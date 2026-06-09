import { defineContentScript } from '#imports';
import { loadCachedSummaries, saveCachedSummaries } from '@/lib/cache';
import { CONFIG } from '@/lib/config';
import { scrapeOutlook, isOutlookReady } from '@/lib/scrapers/outlook';
import { summarize } from '@/lib/summarizer';
import { mountUI } from '@/lib/ui';

export default defineContentScript({
  matches: [
    'https://outlook.live.com/*',
    'https://outlook.office.com/*',
    'https://outlook.office365.com/*',
  ],
  runAt: 'document_idle',
  async main() {
    console.info('[mail-summarizer] Outlook content script chargé sur', location.href);
    const ready = await waitFor(isOutlookReady, 30_000);
    if (!ready) {
      console.warn("[mail-summarizer] Outlook liste non détectée — l'UI sera quand même montée.");
    }
    const initialCached = await loadCachedSummaries('outlook');

    mountUI({
      initialCached,
      async fetchSummaries() {
        const mails = scrapeOutlook(CONFIG.maxMails);
        if (mails.length === 0) {
          throw new Error('Aucun mail trouvé dans la liste Outlook visible.');
        }
        return summarize(mails);
      },
      async onSummariesUpdated(summaries) {
        await saveCachedSummaries('outlook', summaries);
      },
    });
  },
});

function waitFor(check: () => boolean, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (check()) return resolve(true);
    const start = Date.now();
    const obs = new MutationObserver(() => {
      if (check()) {
        obs.disconnect();
        resolve(true);
      } else if (Date.now() - start > timeoutMs) {
        obs.disconnect();
        resolve(false);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  });
}
