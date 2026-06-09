import { CONFIG } from '@/lib/config';
import type { Mail, MailSummary, SummarizeResponse } from '@/lib/types';

/**
 * Envoie les mails au backend qui appelle Gemini et renvoie les résumés.
 *
 *   POST {backendUrl}/summarize
 *   body : { mails: [{ id, subject, from, date, text }] }
 *   200  : { summaries: [{ id, subject, source, date, bullets: string[], category }] }
 */
export async function summarize(mails: Mail[]): Promise<MailSummary[]> {
  const res = await fetch(`${CONFIG.backendUrl}/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mails: mails.map((m) => ({
        id: m.id,
        subject: m.subject,
        from: m.from,
        date: m.date,
        text: m.text.slice(0, 8000),
      })),
    }),
  });
  if (!res.ok) {
    throw new Error(`Backend /summarize : ${res.status} ${await res.text().catch(() => '')}`);
  }
  const data = (await res.json()) as SummarizeResponse;
  return data.summaries;
}
