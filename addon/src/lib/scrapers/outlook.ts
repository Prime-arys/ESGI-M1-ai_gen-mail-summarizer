import type { Mail } from '@/lib/types';

/**
 * Scraping DOM de la liste des mails Outlook (web).
 * Outlook expose chaque message en `[role="option"]` avec un `aria-label`
 * descriptif que l'on parse. On complète avec les sous-éléments quand on les
 * reconnaît (les autoid bougent mais l'ordre des lignes est stable).
 */
export function scrapeOutlook(max: number): Mail[] {
  const rows = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));
  const mails: Mail[] = [];

  for (const row of rows) {
    if (mails.length >= max) break;

    const aria = row.getAttribute('aria-label') || '';
    if (!aria || !looksLikeMessageRow(aria, row)) continue;

    const id =
      row.getAttribute('data-convid') ||
      row.getAttribute('data-itemid') ||
      row.id ||
      `outlook-${mails.length}`;

    const parsed = parseAriaLabel(aria);

    const subject = parsed.subject || textOfFirstMatching(row, ['[id*="subject"]', 'span[title]']) || '(sans objet)';
    const from = parsed.from || textOfFirstMatching(row, ['[id*="from"]', '[id*="sender"]']) || '';
    const date = parsed.date || textOfFirstMatching(row, ['[id*="received"]', 'time']) || '';
    const snippet = parsed.snippet || '';

    mails.push({ id, subject, from, date, text: snippet || aria });
  }

  return mails;
}

export function isOutlookReady(): boolean {
  return document.querySelectorAll('[role="option"]').length > 0;
}

function looksLikeMessageRow(aria: string, row: HTMLElement): boolean {
  // L'arborescence des dossiers utilise aussi role=option : on filtre par taille
  // raisonnable d'aria-label + présence de plusieurs sous-divs.
  return aria.length > 20 && row.querySelectorAll('div, span').length > 3;
}

interface ParsedAria {
  from: string;
  subject: string;
  date: string;
  snippet: string;
}

function parseAriaLabel(aria: string): ParsedAria {
  // Format courant (FR) : "De X. Sujet : Y. Reçu le Z. ..."
  // Format EN : "From X, Subject Y, Received Z, ..."
  // On tente quelques patterns simples ; sinon on laisse le snippet brut.
  const out: ParsedAria = { from: '', subject: '', date: '', snippet: '' };

  const segments = aria.split(/[.,;]\s+/);
  for (const seg of segments) {
    const lower = seg.toLowerCase();
    if (!out.from && (lower.startsWith('from ') || lower.startsWith('de '))) {
      out.from = seg.replace(/^(from |de )/i, '').trim();
    } else if (!out.subject && (lower.startsWith('subject ') || lower.startsWith('sujet '))) {
      out.subject = seg.replace(/^(subject |sujet :?\s*)/i, '').trim();
    } else if (!out.date && (lower.startsWith('received ') || lower.startsWith('reçu '))) {
      out.date = seg.replace(/^(received |reçu (le )?)/i, '').trim();
    }
  }

  // Tout ce qui reste après les champs reconnus sert de snippet.
  out.snippet = aria;
  return out;
}

function textOfFirstMatching(root: HTMLElement, selectors: string[]): string {
  for (const sel of selectors) {
    const el = root.querySelector<HTMLElement>(sel);
    const t = el?.textContent?.trim();
    if (t) return t;
  }
  return '';
}
