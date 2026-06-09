import type { ProviderId } from '@/lib/types';

// Lecture souple des variables d'environnement WXT_* (renseignées dans .env).
const env = import.meta.env as Record<string, string | undefined>;

/**
 * Renseigne ces valeurs via .env (préfixe WXT_) ou directement ici.
 * Voir README pour l'enregistrement des apps OAuth.
 */
export const CONFIG = {
  googleClientId: env.WXT_GOOGLE_CLIENT_ID ?? 'YOUR_GOOGLE_CLIENT_ID',
  // Requis uniquement pour Google (client « Application Web ») à l'échange du code.
  // Microsoft (client public) n'en a PAS besoin. Voir README, section sécurité.
  googleClientSecret: env.WXT_GOOGLE_CLIENT_SECRET ?? '',
  msClientId: env.WXT_MS_CLIENT_ID ?? 'YOUR_MS_CLIENT_ID',
  msTenant: env.WXT_MS_TENANT ?? 'common', // 'common' | 'consumers' | <tenant-id>

  backendUrl: env.WXT_BACKEND_URL ?? 'http://localhost:8000',
  backendToken: env.WXT_BACKEND_TOKEN ?? '',

  sinceDays: 7,
  maxNewsletters: 15,
} as const;

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook / Microsoft 365',
};
