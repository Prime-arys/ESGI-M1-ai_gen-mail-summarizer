import type { Mail } from '@/lib/types';

/**
 * Scraping DOM de la liste des conversations Gmail.
 * Les classes Gmail changent : on combine plusieurs sélecteurs avec
 * fallback pour rester un minimum résistant.
 */
export function scrapeGmail(max: number): Mail[] {
  const rows = document.querySelectorAll<HTMLTableRowElement>('tr.zA');
  const mails: Mail[] = [];

  for (const row of rows) {
    if (mails.length >= max) break;
    const id =
      row.getAttribute('data-thread-id') ||
      row.getAttribute('data-legacy-thread-id') ||
      `gmail-${mails.length}`;

    const senderEl =
      row.querySelector<HTMLElement>('span[email]') ||
      row.querySelector<HTMLElement>('.yW span') ||
      row.querySelector<HTMLElement>('.zF');
    const from =
      senderEl?.getAttribute('email') ||
      senderEl?.getAttribute('name') ||
      senderEl?.textContent?.trim() ||
      '';

    const subjectEl = row.querySelector<HTMLElement>('.bog') || row.querySelector<HTMLElement>('.y6 > span');
    const subject = subjectEl?.textContent?.trim() || '(sans objet)';

    const snippetEl = row.querySelector<HTMLElement>('.y2');
    const snippet = snippetEl?.textContent?.replace(/^\s*-\s*/, '').trim() || '';

    const dateEl = row.querySelector<HTMLElement>('td.xW span[title]') || row.querySelector<HTMLElement>('td.xW span');
    const date = dateEl?.getAttribute('title') || dateEl?.textContent?.trim() || '';

    if (!subject && !snippet) continue;

    mails.push({
      id,
      subject,
      from,
      date,
      text: snippet,
    });
  }

  return mails;
}

/** Détecte si on est dans une vue de liste de mails (pas conversation ouverte). */
export function isGmailReady(): boolean {
  return document.querySelectorAll('tr.zA').length > 0;
}
