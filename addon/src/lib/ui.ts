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
    display: flex; align-items: center; gap: 8px;
    padding: 14px 18px; border-bottom: 1px solid #e5e3da; background: #fff;
  }
  .panel header h2 { margin: 0; font-size: 15px; font-weight: 600; flex: 1; }
  .panel header button {
    background: transparent; border: 0; cursor: pointer;
    font-size: 18px; color: #5f5e5a; padding: 4px 8px;
  }
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
  onSummarize: () => void | Promise<void>;
}

class SummarizerUI {
  private root: ShadowRoot;
  private fab!: HTMLButtonElement;
  private panel!: HTMLDivElement;
  private statusEl!: HTMLDivElement;
  private listEl!: HTMLDivElement;

  constructor(handlers: UiHandlers) {
    const host = document.createElement('div');
    host.id = HOST_ID;
    document.documentElement.appendChild(host);
    this.root = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = STYLE;
    this.root.appendChild(style);

    this.buildFab(handlers);
    this.buildPanel();
  }

  private buildFab(handlers: UiHandlers) {
    this.fab = document.createElement('button');
    this.fab.className = 'fab';
    this.fab.textContent = 'Résumer mes mails';
    this.fab.addEventListener('click', () => handlers.onSummarize());
    this.root.appendChild(this.fab);
  }

  private buildPanel() {
    this.panel = document.createElement('div');
    this.panel.className = 'panel';

    const header = document.createElement('header');
    const h2 = document.createElement('h2');
    h2.textContent = 'Résumés Gemini';
    const close = document.createElement('button');
    close.textContent = '×';
    close.title = 'Fermer';
    close.addEventListener('click', () => this.panel.classList.remove('open'));
    header.append(h2, close);

    this.statusEl = document.createElement('div');
    this.statusEl.className = 'status';

    this.listEl = document.createElement('div');
    this.listEl.className = 'list';

    this.panel.append(header, this.statusEl, this.listEl);
    this.root.appendChild(this.panel);
  }

  setBusy(busy: boolean) {
    this.fab.disabled = busy;
    this.fab.textContent = busy ? 'Résumé en cours…' : 'Résumer mes mails';
  }

  setStatus(msg: string) {
    this.statusEl.textContent = msg;
    this.panel.classList.add('open');
  }

  showError(msg: string) {
    this.listEl.innerHTML = '';
    const err = document.createElement('div');
    err.className = 'err';
    err.textContent = msg;
    this.listEl.appendChild(err);
    this.panel.classList.add('open');
  }

  renderSummaries(summaries: MailSummary[]) {
    this.listEl.innerHTML = '';
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
    this.panel.classList.add('open');
  }
}

let instance: SummarizerUI | null = null;

export function mountUI(handlers: UiHandlers): SummarizerUI {
  if (instance) return instance;
  instance = new SummarizerUI(handlers);
  return instance;
}
