import { defineBackground, browser } from '#imports';

export default defineBackground(() => {
  // Clic sur l'icône → ouvre Gmail si l'onglet courant n'est pas déjà
  // sur un webmail supporté. Le content script fait le reste.
  browser.action.onClicked.addListener(async (tab) => {
    const url = tab.url ?? '';
    const supported = /^https:\/\/(mail\.google\.com|outlook\.(live|office|office365)\.com)\//.test(url);
    if (!supported) {
      await browser.tabs.create({ url: 'https://mail.google.com/' });
    }
  });
});
