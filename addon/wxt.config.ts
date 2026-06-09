import { defineConfig } from 'wxt';

// https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Mail Summarizer',
    description:
      "Récupère localement les derniers mails de Gmail / Outlook et affiche un résumé Gemini directement dans l'interface.",
    version: '0.2.0',
    permissions: ['storage', 'activeTab'],
    host_permissions: [
      // Pages où on injecte le content script (DOM scraping)
      'https://mail.google.com/*',
      'https://outlook.live.com/*',
      'https://outlook.office.com/*',
      'https://outlook.office365.com/*',
      // Backend de résumé local
      'http://localhost:8000/*',
      'http://127.0.0.1:8000/*',
    ],
    action: { default_title: 'Ouvrir Gmail (Mail Summarizer)' },
    browser_specific_settings: {
      gecko: { id: 'mail-summarizer@example.com' },
    },
  },
});
