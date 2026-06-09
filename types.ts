export type ProviderId = 'gmail' | 'outlook';

/** Un email identifié comme newsletter, nettoyé en texte brut. */
export interface Newsletter {
  id: string;
  subject: string;
  from: string;
  date: string; // ISO 8601
  text: string; // contenu en texte brut (HTML déjà nettoyé)
  listUnsubscribe?: string;
}

/** Résumé renvoyé par le backend pour une newsletter. */
export interface NewsletterSummary {
  id: string;
  subject: string;
  source: string;
  bullets: string[];
  url?: string;
}

export interface OAuthTokens {
  accessToken: string;
  expiresAt: number; // timestamp ms
  refreshToken?: string;
}
