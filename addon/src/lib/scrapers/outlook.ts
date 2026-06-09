import type { Mail } from '@/lib/types';

/**
 * Scraping DOM de la liste des mails Outlook (web).
 * Outlook web utilise des id préfixés stables (`subject-`, `from-`, `received-`,
 * `previewText-`). On les cible en priorité ; fallback sur aria-label parsing
 * si la structure change.
 */
export function scrapeOutlook(max: number): Mail[] {
  const rows = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));
  const mails: Mail[] = [];

  for (const row of rows) {
    if (mails.length >= max) break;
    if (!looksLikeMessageRow(row)) continue;

    const id =
      row.getAttribute('data-convid') ||
      row.getAttribute('data-itemid') ||
      row.id ||
      `outlook-${mails.length}`;

    // 1. Sélecteurs Outlook stables (id préfixés).
    const subjectEl = row.querySelector<HTMLElement>('[id^="subject-"], [id*="subject"]');
    const fromEl = row.querySelector<HTMLElement>('[id^="from-"], [id*="sender"], [id*="from"]');
    const dateEl = row.querySelector<HTMLElement>('[id^="received-"], [id*="received"], time');
    const previewEl = row.querySelector<HTMLElement>('[id^="previewText-"], [id*="preview"]');

    let subject = textOf(subjectEl);
    let from = textOf(fromEl);
    let date = textOf(dateEl);
    let snippet = textOf(previewEl);

    // 2. Fallback : on parse l'aria-label si certains champs sont vides.
    if (!subject || !from || !snippet) {
      const aria = row.getAttribute('aria-label') || '';
      const parsed = parseAriaLabel(aria);
      subject = subject || parsed.subject;
      from = from || parsed.from;
      date = date || parsed.date;
      snippet = snippet || parsed.snippet || aria;
    }

    if (!subject && !snippet) continue;

    mails.push({
      id,
      subject: subject || '(sans objet)',
      from,
      date,
      text: snippet,
    });
  }

  return mails;
}

export function isOutlookReady(): boolean {
  // On ne se base plus sur role=option (présent pour folder tree aussi).
  return document.querySelectorAll('[role="option"] [id^="subject-"], [role="option"] [id*="subject"]').length > 0;
}

function looksLikeMessageRow(row: HTMLElement): boolean {
  // Un vrai row de message a au moins un sub-element subject ou un aria-label long.
  if (row.querySelector('[id^="subject-"], [id*="subject"]')) return true;
  const aria = row.getAttribute('aria-label') || '';
  return aria.length > 30 && row.querySelectorAll('div, span').length > 4;
}

function textOf(el: HTMLElement | null): string {
  return el?.textContent?.trim() || '';
}

interface ParsedAria {
  from: string;
  subject: string;
  date: string;
  snippet: string;
}

function parseAriaLabel(aria: string): ParsedAria {
  const out: ParsedAria = { from: '', subject: '', date: '', snippet: aria };
  const segments = aria.split(/[.,;]\s+/);
  for (const seg of segments) {
    const lower = seg.toLowerCase();
    if (!out.from && /^(from |de |expéditeur )/i.test(seg)) {
      out.from = seg.replace(/^(from |de |expéditeur )/i, '').trim();
    } else if (!out.subject && /^(subject |sujet )/i.test(seg)) {
      out.subject = seg.replace(/^(subject |sujet :?\s*)/i, '').trim();
    } else if (!out.date && /^(received |reçu )/i.test(seg)) {
      out.date = seg.replace(/^(received |reçu (le )?)/i, '').trim();
    }
  }
  return out;
}
