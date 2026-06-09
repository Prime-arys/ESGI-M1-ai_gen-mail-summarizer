import { defineContentScript } from '#imports';
import { loadCachedSummaries, saveCachedSummaries } from '@/lib/cache';
import { CONFIG } from '@/lib/config';
import { scrapeGmail, isGmailReady } from '@/lib/scrapers/gmail';
import { summarize } from '@/lib/summarizer';
import { mountUI } from '@/lib/ui';

export default defineContentScript({
  matches: ['https://mail.google.com/*'],
  runAt: 'document_idle',
  async main() {
    const ready = await waitFor(isGmailReady, 30_000);
    if (!ready) {
      console.warn("[mail-summarizer] Gmail liste non détectée — l'UI sera quand même montée.");
    }
    const initialCached = await loadCachedSummaries('gmail');

    mountUI({
      initialCached,
      async fetchSummaries() {
        const mails = scrapeGmail(CONFIG.maxMails);
        if (mails.length === 0) {
          throw new Error('Aucun mail trouvé dans la liste Gmail visible.');
        }
        return summarize(mails);
      },
      async onSummariesUpdated(summaries) {
        await saveCachedSummaries('gmail', summaries);
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
