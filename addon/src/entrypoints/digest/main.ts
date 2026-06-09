import { getProvider } from '@/lib/providers';
import { summarize } from '@/lib/summarizer';
import { buildDigestPdf } from '@/lib/pdf';
import { CONFIG } from '@/lib/config';
import type { ProviderId } from '@/lib/types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const providerSel = $<HTMLSelectElement>('provider');
const runBtn = $<HTMLButtonElement>('run');
const statusEl = $<HTMLDivElement>('status');
const viewer = $<HTMLIFrameElement>('viewer');
const download = $<HTMLAnchorElement>('download');

const setStatus = (msg: string) => {
  statusEl.textContent = msg;
};

// Présélection éventuelle via ?provider=
const initial = new URLSearchParams(location.search).get('provider') as ProviderId | null;
if (initial) providerSel.value = initial;

let currentUrl: string | null = null;

async function run() {
  runBtn.disabled = true;
  download.style.display = 'none';
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
  const providerId = providerSel.value as ProviderId;

  try {
    setStatus('Authentification…');
    const provider = getProvider(providerId);

    setStatus('Récupération des newsletters…');
    const newsletters = await provider.fetchRecentNewsletters(CONFIG.sinceDays, CONFIG.maxNewsletters);
    if (newsletters.length === 0) {
      setStatus('Aucune newsletter trouvée sur la période.');
      return;
    }

    setStatus(`Résumé de ${newsletters.length} newsletter(s) via le backend…`);
    const summaries = await summarize(newsletters);

    setStatus('Génération du PDF…');
    const blob = buildDigestPdf(summaries);
    currentUrl = URL.createObjectURL(blob);
    viewer.src = currentUrl;
    download.href = currentUrl;
    download.style.display = 'inline-block';
    setStatus(`Digest prêt — ${summaries.length} résumé(s).`);
  } catch (err) {
    console.error(err);
    setStatus(`Erreur : ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    runBtn.disabled = false;
  }
}

runBtn.addEventListener('click', run);
