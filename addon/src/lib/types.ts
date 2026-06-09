export type ProviderId = 'gmail' | 'outlook';

/** Un mail brut récupéré depuis le DOM de l'UI Gmail / Outlook. */
export interface Mail {
  id: string;
  subject: string;
  from: string;
  date: string;
  text: string;
}

/** Résumé renvoyé par le backend pour un mail. */
export interface MailSummary {
  id: string;
  subject: string;
  source: string;
  date: string;
  bullets: string[];
  category: string;
}

export interface SummarizeResponse {
  summaries: MailSummary[];
}
