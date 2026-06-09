const env = import.meta.env as Record<string, string | undefined>;

/**
 * Config runtime. Surchargeable via .env (préfixe WXT_).
 */
export const CONFIG = {
  backendUrl: env.WXT_BACKEND_URL ?? 'http://localhost:8000',

  /** Nombre max de mails scrapés et envoyés au backend par clic. */
  maxMails: 5,
} as const;
