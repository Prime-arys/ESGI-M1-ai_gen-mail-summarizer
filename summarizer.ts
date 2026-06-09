import { CONFIG } from '@/lib/config';
import type { Newsletter, NewsletterSummary } from '@/lib/types';

/**
 * Envoie les newsletters au backend qui appelle le LLM et renvoie les résumés.
 *
 * Contrat attendu :
 *   POST {backendUrl}/summarize
 *   body : { newsletters: [{ id, subject, from, date, text }] }
 *   200  : { summaries: [{ id, subject, source, bullets: string[], url? }] }
 */
export async function summarize(newsletters: Newsletter[]): Promise<NewsletterSummary[]> {
  const res = await fetch(`${CONFIG.backendUrl}/summarize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(CONFIG.backendToken ? { Authorization: `Bearer ${CONFIG.backendToken}` } : {}),
    },
    body: JSON.stringify({
      newsletters: newsletters.map((n) => ({
        id: n.id,
        subject: n.subject,
        from: n.from,
        date: n.date,
        text: n.text.slice(0, 8000), // borne le contexte envoyé au LLM
      })),
    }),
  });
  if (!res.ok) throw new Error(`Backend /summarize : ${res.status}`);
  const data = await res.json();
  return data.summaries as NewsletterSummary[];
}
