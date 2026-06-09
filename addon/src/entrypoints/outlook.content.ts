import { defineContentScript } from '#imports';
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
  main() {
    waitFor(isOutlookReady, 30_000).then((ready) => {
      if (!ready) {
        console.warn('[mail-summarizer] Outlook liste non détectée — l\'UI sera quand même montée.');
      }
      const ui = mountUI({
        async onSummarize() {
          try {
            ui.setBusy(true);
            const mails = scrapeOutlook(CONFIG.maxMails);
            if (mails.length === 0) {
              ui.showError('Aucun mail trouvé dans la liste Outlook visible.');
              return;
            }
            ui.setStatus(`Envoi de ${mails.length} mail(s) au backend…`);
            const summaries = await summarize(mails);
            ui.renderSummaries(summaries);
          } catch (err) {
            console.error('[mail-summarizer]', err);
            ui.showError(`Erreur : ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            ui.setBusy(false);
          }
        },
      });
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
