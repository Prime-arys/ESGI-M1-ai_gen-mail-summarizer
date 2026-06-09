import { browser, storage } from '#imports';
import { CONFIG } from '@/lib/config';
import type { ProviderId, OAuthTokens } from '@/lib/types';

interface OAuthConfig {
  authorizeEndpoint: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  scopes: string[];
  extraAuthParams?: Record<string, string>;
}

function oauthConfig(provider: ProviderId): OAuthConfig {
  if (provider === 'gmail') {
    return {
      authorizeEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
      clientId: CONFIG.googleClientId,
      clientSecret: CONFIG.googleClientSecret || undefined,
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      // access_type=offline + prompt=consent => on obtient un refresh_token
      extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    };
  }
  return {
    authorizeEndpoint: `https://login.microsoftonline.com/${CONFIG.msTenant}/oauth2/v2.0/authorize`,
    tokenEndpoint: `https://login.microsoftonline.com/${CONFIG.msTenant}/oauth2/v2.0/token`,
    clientId: CONFIG.msClientId,
    scopes: ['Mail.Read', 'offline_access'],
  };
}

/* ---------- Helpers PKCE (RFC 7636) ---------- */

function base64UrlEncode(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(byteLength = 32): string {
  const arr = new Uint8Array(byteLength);
  crypto.getRandomValues(arr);
  return base64UrlEncode(arr.buffer);
}

async function challengeFromVerifier(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(digest);
}

/**
 * URL de redirection OAuth, par navigateur et par fournisseur.
 * - Chrome  : https://<id>.chromiumapp.org/<provider>
 * - Firefox : https://<sous-domaine>.extensions.allizom.org/<provider>
 *   ... SAUF pour Google, qui refuse ce domaine. On bascule alors sur
 *   l'adresse loopback acceptée par Firefox >= 86.
 */
function getRedirectUri(provider: ProviderId): string {
  const url = browser.identity.getRedirectURL(provider);
  if (import.meta.env.BROWSER === 'firefox' && provider === 'gmail') {
    const subdomain = new URL(url).hostname.split('.')[0];
    return `http://127.0.0.1/mozoauth2/${subdomain}`;
  }
  return url;
}

/* ---------- Stockage des tokens ----------
 * Access token : zone "session" (mémoire, effacée à la fermeture du navigateur).
 * Refresh token : zone "local" (persistant). Sensible — voir note sécurité du README.
 */
const accessKey = (p: ProviderId) => `session:access_${p}`;
const refreshKey = (p: ProviderId) => `local:refresh_${p}`;

interface StoredAccess {
  token: string;
  expiresAt: number;
}

/* ---------- Flux OAuth ---------- */

async function exchangeToken(provider: ProviderId, params: Record<string, string>): Promise<OAuthTokens> {
  const cfg = oauthConfig(provider);
  const body = new URLSearchParams({ client_id: cfg.clientId, ...params });
  if (cfg.clientSecret) body.set('client_secret', cfg.clientSecret);

  const res = await fetch(cfg.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`OAuth token (${provider}) : ${res.status} ${await res.text()}`);
  const json = await res.json();
  return {
    accessToken: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 - 60_000, // marge 1 min
    refreshToken: json.refresh_token,
  };
}

/** Lance le consentement interactif puis stocke les tokens. */
export async function login(provider: ProviderId): Promise<void> {
  const cfg = oauthConfig(provider);
  const redirectUri = getRedirectUri(provider);
  const verifier = randomString();
  const challenge = await challengeFromVerifier(verifier);
  const state = randomString(16);

  const authUrl = new URL(cfg.authorizeEndpoint);
  const params: Record<string, string> = {
    client_id: cfg.clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: cfg.scopes.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    ...cfg.extraAuthParams,
  };
  for (const [k, v] of Object.entries(params)) authUrl.searchParams.set(k, v);

  const responseUrl = await browser.identity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true,
  });
  if (!responseUrl) throw new Error('Flux OAuth annulé');

  const returned = new URL(responseUrl);
  const error = returned.searchParams.get('error');
  if (error) throw new Error(`OAuth refusé : ${returned.searchParams.get('error_description') ?? error}`);
  if (returned.searchParams.get('state') !== state) throw new Error('State OAuth invalide (CSRF ?)');
  const code = returned.searchParams.get('code');
  if (!code) throw new Error("Aucun code d'autorisation reçu");

  const tokens = await exchangeToken(provider, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });

  await storage.setItem<StoredAccess>(accessKey(provider), {
    token: tokens.accessToken,
    expiresAt: tokens.expiresAt,
  });
  if (tokens.refreshToken) await storage.setItem<string>(refreshKey(provider), tokens.refreshToken);
}

async function refresh(provider: ProviderId): Promise<string | null> {
  const refreshToken = await storage.getItem<string>(refreshKey(provider));
  if (!refreshToken) return null;
  const cfg = oauthConfig(provider);
  try {
    const tokens = await exchangeToken(provider, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: cfg.scopes.join(' '),
    });
    await storage.setItem<StoredAccess>(accessKey(provider), {
      token: tokens.accessToken,
      expiresAt: tokens.expiresAt,
    });
    if (tokens.refreshToken) await storage.setItem<string>(refreshKey(provider), tokens.refreshToken);
    return tokens.accessToken;
  } catch {
    return null; // refresh expiré/révoqué -> reconnexion interactive
  }
}

/**
 * Renvoie un access token valide :
 *   cache mémoire -> refresh silencieux -> consentement interactif.
 */
export async function getAccessToken(provider: ProviderId): Promise<string> {
  const cached = await storage.getItem<StoredAccess>(accessKey(provider));
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const refreshed = await refresh(provider);
  if (refreshed) return refreshed;

  await login(provider);
  const after = await storage.getItem<StoredAccess>(accessKey(provider));
  if (!after) throw new Error("Échec de l'authentification");
  return after.token;
}

/** Déconnexion : efface les tokens stockés. */
export async function logout(provider: ProviderId): Promise<void> {
  await storage.removeItem(accessKey(provider));
  await storage.removeItem(refreshKey(provider));
}
