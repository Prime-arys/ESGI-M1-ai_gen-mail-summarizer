import { defineBackground, browser } from '#imports';

export default defineBackground(() => {
  // Pas de popup : un clic sur l'icône ouvre la page du digest (onglet à part).
  // Un onglet plein évite que le flux OAuth ne ferme une popup au moment où elle perd le focus.
  browser.action.onClicked.addListener(() => {
    browser.tabs.create({ url: browser.runtime.getURL('/digest.html') });
  });
});
