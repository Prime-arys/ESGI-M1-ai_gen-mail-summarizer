import { defineConfig } from 'wxt';

// https://wxt.dev/api/config.html
export default defineConfig({
  // Pages en vanilla TS ici. Pour React : décommente la ligne ci-dessous + pnpm add @wxt-dev/module-react
  srcDir: "src",
  // modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Newsletter Digest',
    description: 'Récupère tes dernières newsletters, les résume via un backend LLM et génère un PDF.',
    version: '0.1.0',
    permissions: ['identity', 'storage'],
    host_permissions: [
      // Google OAuth + Gmail API
      'https://accounts.google.com/*',
      'https://oauth2.googleapis.com/*',
      'https://gmail.googleapis.com/*',
      // Microsoft OAuth + Graph API
      'https://login.microsoftonline.com/*',
      'https://graph.microsoft.com/*',
      // Backend de résumé (adapte l'URL à ta prod)
      'http://localhost:8000/*',
    ],
    action: { default_title: 'Générer le digest' },
    // ID stable indispensable côté Firefox pour une URL de redirection OAuth fixe.
    browser_specific_settings: {
      gecko: { id: 'newsletter-digest@example.com' },
    },
  },
});
