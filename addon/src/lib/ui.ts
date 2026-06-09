import type { MailSummary } from '@/lib/types';

const HOST_ID = 'mail-summarizer-host';

const STYLE = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  .fab {
    position: fixed; right: 20px; bottom: 20px; z-index: 2147483646;
    padding: 12px 18px; border-radius: 999px;
    background: #1f6e56; color: #fff; font-weight: 600; font-size: 14px;
    border: 0; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.18);
  }
  .fab:hover { background: #185845; }
  .fab:disabled { opacity: .6; cursor: default; }
  .fab.cached { background: #2a5a8a; }
  .fab.cached:hover { background: #214670; }

  .panel {
    position: fixed; top: 0; right: 0; bottom: 0; width: 420px; max-width: 95vw;
    background: #faf9f5; color: #1a1a18;
    box-shadow: -8px 0 24px rgba(0,0,0,.12);
    z-index: 2147483647;
    display: flex; flex-direction: column;
    transform: translateX(100%); transition: transform .25s ease;
  }
  .panel.open { transform: translateX(0); }
  .panel header {
    display: flex; align-items: center; gap: 4px;
    padding: 14px 18px; border-bottom: 1px solid #e5e3da; background: #fff;
  }
  .panel header h2 { margin: 0; font-size: 15px; font-weight: 600; flex: 1; }
  .panel header button {
    background: transparent; border: 0; cursor: pointer;
    font-size: 16px; color: #5f5e5a; padding: 4px 8px; border-radius: 6px;
  }
  .panel header button:hover { background: #f0eee5; }
  .panel header button:disabled { opacity: .4; cursor: default; }
  .panel header button.refresh { font-size: 15px; }
  .panel header button.refresh.spinning { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .status { padding: 10px 18px; font-size: 12px; color: #5f5e5a; }
  .list { overflow: auto; padding: 0 16px 16px; }

  .card {
    background: #fff; border: 1px solid #e5e3da; border-radius: 10px;
    padding: 12px 14px; margin-top: 12px;
  }
  .card h3 {
    margin: 0 0 4px; font-size: 13px; font-weight: 600; line-height: 1.3;
  }
  .meta { font-size: 11px; color: #6b6a66; margin-bottom: 8px; }
  .meta .cat {
    display: inline-block; padding: 1px 6px; border-radius: 4px;
    background: #ece7d8; color: #4a4a44; margin-left: 6px; font-weight: 500;
  }
  ul { margin: 0; padding-left: 18px; }
  li { font-size: 12.5px; line-height: 1.45; margin-bottom: 3px; }
  .err { color: #9b1c1c; font-size: 12.5px; padding: 10px 0; }
`;

export interface UiHandlers {
  /** Scrape + envoie au backend + retourne les résumés. Appelé pour générer ET pour rafraîchir. */
  fetchSummaries: () => Promise<MailSummary[]>;
  /** Hook appelé après chaque fetch réussi pour permettre au content script de persister. */
  onSummariesUpdated?: (summaries: MailSummary[]) => Promise<void> | void;
  /** Résumés déjà en cache si on a déjà généré une fois récemment. */
  initialCached?: MailSummary[] | null;
}

class SummarizerUI {
  private root: ShadowRoot;
  private fab!: HTMLButtonElement;
  private panel!: HTMLDivElement;
  private refreshBtn!: HTMLButtonElement;
  private statusEl!: HTMLDivElement;
  private listEl!: HTMLDivElement;
  private current: MailSummary[] | null;
  private handlers: UiHandlers;

  constructor(handlers: UiHandlers) {
    this.handlers = handlers;
    this.current = handlers.initialCached ?? null;

    const host = document.createElement('div');
    host.id = HOST_ID;
    document.documentElement.appendChild(host);
    this.root = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = STYLE;
    this.root.appendChild(style);

    this.buildFab();
    this.buildPanel();
    this.applyMode();
  }

  private buildFab() {
    this.fab = document.createElement('button');
    this.fab.className = 'fab';
    this.fab.addEventListener('click', () => this.onFabClick());
    this.root.appendChild(this.fab);
  }

  private buildPanel() {
    this.panel = document.createElement('div');
    this.panel.className = 'panel';

    const header = document.createElement('header');
    const h2 = document.createElement('h2');
    h2.textContent = 'Résumés Gemini';

    this.refreshBtn = document.createElement('button');
    this.refreshBtn.className = 'refresh';
    this.refreshBtn.textContent = '↻';
    this.refreshBtn.title = 'Régénérer les résumés';
    this.refreshBtn.addEventListener('click', () => this.runFetch(true));

    const close = document.createElement('button');
    close.textContent = '×';
    close.title = 'Fermer';
    close.addEventListener('click', () => this.panel.classList.remove('open'));

    header.append(h2, this.refreshBtn, close);

    this.statusEl = document.createElement('div');
    this.statusEl.className = 'status';

    this.listEl = document.createElement('div');
    this.listEl.className = 'list';

    this.panel.append(header, this.statusEl, this.listEl);
    this.root.appendChild(this.panel);
  }

  /** Met à jour le label du FAB selon qu'on a déjà des résumés ou pas. */
  private applyMode() {
    if (this.current && this.current.length > 0) {
      this.fab.textContent = 'Voir';
      this.fab.classList.add('cached');
      this.fab.title = 'Voir les derniers résumés (cliquez sur ↻ pour rafraîchir)';
    } else {
      this.fab.textContent = 'Résumer mes mails';
      this.fab.classList.remove('cached');
      this.fab.title = '';
    }
  }

  private async onFabClick() {
    if (this.current && this.current.length > 0) {
      // Cache présent : on affiche sans réappeler le backend.
      this.statusEl.textContent = `${this.current.length} résumé(s) en cache.`;
      this.renderList(this.current);
      this.panel.classList.add('open');
      return;
    }
    await this.runFetch(false);
  }

  private async runFetch(isRefresh: boolean) {
    this.setBusy(true);
    this.panel.classList.add('open');
    this.statusEl.textContent = isRefresh ? 'Rafraîchissement…' : 'Envoi au backend…';
    if (isRefresh) this.refreshBtn.classList.add('spinning');
    try {
      const summaries = await this.handlers.fetchSummaries();
      this.current = summaries;
      await this.handlers.onSummariesUpdated?.(summaries);
      this.renderList(summaries);
      this.statusEl.textContent = `${summaries.length} résumé(s) — mis à jour à ${new Date().toLocaleTimeString('fr-FR')}.`;
      this.applyMode();
    } catch (err) {
      console.error('[mail-summarizer]', err);
      this.showError(`Erreur : ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.setBusy(false);
      this.refreshBtn.classList.remove('spinning');
    }
  }

  private setBusy(busy: boolean) {
    this.fab.disabled = busy;
    this.refreshBtn.disabled = busy;
    if (busy) this.fab.textContent = 'Chargement…';
    else this.applyMode();
  }

  showError(msg: string) {
    this.listEl.innerHTML = '';
    const err = document.createElement('div');
    err.className = 'err';
    err.textContent = msg;
    this.listEl.appendChild(err);
    this.panel.classList.add('open');
  }

  private renderList(summaries: MailSummary[]) {
    this.listEl.innerHTML = '';
    if (summaries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'err';
      empty.textContent = 'Aucun résumé.';
      this.listEl.appendChild(empty);
      return;
    }
    for (const s of summaries) {
      const card = document.createElement('div');
      card.className = 'card';

      const h = document.createElement('h3');
      h.textContent = s.subject || '(sans objet)';

      const meta = document.createElement('div');
      meta.className = 'meta';
      const sender = document.createElement('span');
      sender.textContent = s.source || '';
      meta.appendChild(sender);
      if (s.category) {
        const cat = document.createElement('span');
        cat.className = 'cat';
        cat.textContent = s.category;
        meta.appendChild(cat);
      }

      const ul = document.createElement('ul');
      for (const b of s.bullets) {
        const li = document.createElement('li');
        li.textContent = b;
        ul.appendChild(li);
      }

      card.append(h, meta, ul);
      this.listEl.appendChild(card);
    }
  }
}

let instance: SummarizerUI | null = null;

export function mountUI(handlers: UiHandlers): SummarizerUI {
  if (instance) return instance;
  instance = new SummarizerUI(handlers);
  return instance;
}
