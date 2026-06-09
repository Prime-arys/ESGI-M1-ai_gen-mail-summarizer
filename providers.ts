import { getAccessToken } from '@/lib/auth';
import type { Newsletter, ProviderId } from '@/lib/types';

/* ============================================================
 *  Interface commune — toute source de mail l'implémente.
 *  Ajouter un fournisseur = une nouvelle classe, sans toucher au reste.
 * ============================================================ */
export interface IMailProvider {
  readonly id: ProviderId;
  fetchRecentNewsletters(sinceDays: number, max: number): Promise<Newsletter[]>;
}

/* ---------- Helpers partagés ---------- */

/** Une newsletter expose quasi toujours List-Unsubscribe ou List-Id (RFC 2369/8058). */
function isNewsletter(headers: Record<string, string>): boolean {
  return 'list-unsubscribe' in headers || 'list-id' in headers;
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeBase64Url(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

/* ============================================================
 *  Gmail — API REST + token OAuth (PKCE)
 * ============================================================ */
class GmailProvider implements IMailProvider {
  readonly id = 'gmail' as const;
  private base = 'https://gmail.googleapis.com/gmail/v1/users/me';

  async fetchRecentNewsletters(sinceDays: number, max: number): Promise<Newsletter[]> {
    const token = await getAccessToken('gmail');
    const auth = { Authorization: `Bearer ${token}` };

    // Filtre large : Promotions/Mises à jour récentes (ajustable).
    const q = `newer_than:${sinceDays}d (category:promotions OR category:updates)`;
    const listRes = await fetch(
      `${this.base}/messages?maxResults=${max * 2}&q=${encodeURIComponent(q)}`,
      { headers: auth },
    );
    if (!listRes.ok) throw new Error(`Gmail list : ${listRes.status}`);
    const { messages = [] } = await listRes.json();

    const out: Newsletter[] = [];
    for (const { id } of messages as Array<{ id: string }>) {
      const msgRes = await fetch(`${this.base}/messages/${id}?format=full`, { headers: auth });
      if (!msgRes.ok) continue;
      const msg = await msgRes.json();

      const headers: Record<string, string> = {};
      for (const h of msg.payload?.headers ?? []) headers[h.name.toLowerCase()] = h.value;
      if (!isNewsletter(headers)) continue; // on garde seulement les vraies newsletters

      out.push({
        id,
        subject: headers['subject'] ?? '(sans objet)',
        from: headers['from'] ?? '',
        date: new Date(Number(msg.internalDate)).toISOString(),
        text: extractGmailText(msg.payload),
        listUnsubscribe: headers['list-unsubscribe'],
      });
      if (out.length >= max) break;
    }
    return out;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractGmailText(payload: any): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = (p: any) => {
    if (!p) return;
    if (p.body?.data) parts.push(p);
    (p.parts ?? []).forEach(walk);
  };
  walk(payload);
  const plain = parts.find((p) => p.mimeType === 'text/plain');
  const html = parts.find((p) => p.mimeType === 'text/html');
  if (plain) return decodeBase64Url(plain.body.data);
  if (html) return htmlToText(decodeBase64Url(html.body.data));
  return '';
}

/* ============================================================
 *  Outlook / Microsoft 365 — Microsoft Graph + token OAuth (PKCE)
 * ============================================================ */
class OutlookProvider implements IMailProvider {
  readonly id = 'outlook' as const;

  async fetchRecentNewsletters(sinceDays: number, max: number): Promise<Newsletter[]> {
    const token = await getAccessToken('outlook');
    const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();

    const url =
      `https://graph.microsoft.com/v1.0/me/messages` +
      `?$top=${max * 2}` +
      `&$orderby=receivedDateTime desc` +
      `&$filter=${encodeURIComponent(`receivedDateTime ge ${since}`)}` +
      `&$select=id,subject,from,receivedDateTime,body,internetMessageHeaders`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Graph messages : ${res.status}`);
    const { value = [] } = await res.json();

    const out: Newsletter[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const m of value as any[]) {
      const headers: Record<string, string> = {};
      for (const h of m.internetMessageHeaders ?? []) headers[h.name.toLowerCase()] = h.value;
      if (!isNewsletter(headers)) continue;

      const body: string = m.body?.content ?? '';
      out.push({
        id: m.id,
        subject: m.subject ?? '(sans objet)',
        from: m.from?.emailAddress?.address ?? '',
        date: m.receivedDateTime,
        text: m.body?.contentType === 'html' ? htmlToText(body) : body,
        listUnsubscribe: headers['list-unsubscribe'],
      });
      if (out.length >= max) break;
    }
    return out;
  }
}

/* ---------- Fabrique ---------- */
export function getProvider(id: ProviderId): IMailProvider {
  return id === 'gmail' ? new GmailProvider() : new OutlookProvider();
}
