import { css, html, LitElement, nothing } from 'lit';
import type { PropertyValues, TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { msg, updateWhenLocaleChanges } from '@lit/localize';
import { ScopedElementsMixin } from '@open-wc/scoped-elements/lit-element.js';

import { OscdFilledButton } from '@omicronenergy/oscd-ui/button/OscdFilledButton.js';
import { OscdIcon } from '@omicronenergy/oscd-ui/icon/OscdIcon.js';
import { OscdTextButton } from '@omicronenergy/oscd-ui/button/OscdTextButton.js';

import { applyScopeText, scopeText } from '../foundation/json-scope.js';
import type { JsonScope } from '../foundation/json-scope.js';
import type { StencilData } from '../foundation/types.js';
import { OscdStencilHelp } from '../shared/help.js';
import { helpJson } from '../shared/help-content.js';
import { themeStyles } from '../theme.js';

type AceEditorElement = HTMLElement & {
  updateComplete: Promise<boolean>;
  editor?: {
    session: { setUseWorker(use: boolean): void; setMode(mode: string): void };
  };
  aceEditorBase?: { mode?: string; editor?: AceEditorElement['editor'] };
};

/** oscd-ui keeps the settings of every Ace editor in the browser, under this key. */
const ACE_OPTIONS_KEY = 'oscd:ace-options';
const JSON_MODE = 'ace/mode/json';

function storedAceMode(): string | undefined {
  try {
    return JSON.parse(localStorage.getItem(ACE_OPTIONS_KEY) ?? '{}').mode;
  } catch {
    return undefined;
  }
}

/** Puts a mode back in the shared settings, so other editors (XML) are not left in JSON. */
function storeAceMode(mode: string): void {
  try {
    const stored = localStorage.getItem(ACE_OPTIONS_KEY);
    if (stored) {
      localStorage.setItem(
        ACE_OPTIONS_KEY,
        JSON.stringify({ ...JSON.parse(stored), mode })
      );
    }
  } catch {
    // the settings are not ours to insist on
  }
}

/** The Ace editor is large, so it is only loaded when this view is opened. */
const loadAceEditor = async () =>
  (await import('@omicronenergy/oscd-ui/ace-editor/OscdAceEditor.js'))
    .OscdAceEditor;

/**
 * Edits the stencil, or one application or version of it, as JSON, for the
 * changes the forms do not cover.
 *
 * The text is checked as it is typed. Only valid text can be saved, and
 * saving raises `stencil-change` with the whole new stencil.
 */
export class OscdStencilJson extends ScopedElementsMixin(LitElement) {
  static scopedElements = {
    'oscd-filled-button': OscdFilledButton,
    'oscd-icon': OscdIcon,
    'oscd-stencil-help': OscdStencilHelp,
    'oscd-text-button': OscdTextButton
  };

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  @property({ attribute: false }) stencil!: StencilData;

  /** What is edited. The whole stencil unless told otherwise. */
  @property({ attribute: false }) scope: JsonScope = { kind: 'stencil' };

  /** What is in the editor, which may not be valid yet. */
  @state() draft = '';

  @state() editorReady = false;

  private saved = '';

  /** The mode other editors use, which is put back when this one goes. */
  private shared = 'ace/mode/xml';

  connectedCallback(): void {
    super.connectedCallback();
    const mode = storedAceMode();
    this.shared = !mode || mode === JSON_MODE ? 'ace/mode/xml' : mode;
    storeAceMode(this.shared);
    loadAceEditor().then((OscdAceEditor) => {
      if (!this.registry?.get('oscd-ace-editor')) {
        this.registry?.define('oscd-ace-editor', OscdAceEditor);
      }
      this.editorReady = true;
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    storeAceMode(this.shared);
  }

  /** The editor is made for XML, so switch it to JSON once it is there. */
  private async useJsonMode(): Promise<void> {
    const ace = this.shadowRoot?.querySelector<AceEditorElement>('#editor');
    if (!ace || this.jsonMode) {
      return;
    }
    this.jsonMode = true;
    await Promise.all([
      import('@omicronenergy/oscd-ui/ace-editor/ace/mode-json.js'),
      ace.updateComplete
    ]);
    // Ask for the mode, and also set it on the session once there is one:
    // the editor may already ask for JSON (before the mode was loaded), when
    // asking again changes nothing. Ace would also fetch a worker script that
    // is not served; the text is checked here instead.
    if (ace.aceEditorBase) {
      ace.aceEditorBase.mode = JSON_MODE;
    }
    for (let tries = 0; tries < 40; tries += 1) {
      const editor = ace.editor ?? ace.aceEditorBase?.editor;
      if (editor) {
        editor.session.setUseWorker(false);
        editor.session.setMode(JSON_MODE);
        return;
      }
       
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    }
  }

  private jsonMode = false;

  protected updated(): void {
    if (this.editorReady) {
      this.useJsonMode();
    }
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('stencil') || changed.has('scope')) {
      const text = scopeText(this.stencil, this.scope);
      // edits are kept when the stencil is replaced, but not for another scope
      if (this.draft === '' || this.draft === this.saved || changed.has('scope')) {
        this.draft = text;
      }
      this.saved = text;
    }
  }

  private get result(): ReturnType<typeof applyScopeText> {
    return applyScopeText(this.stencil, this.scope, this.draft);
  }

  private get changed(): boolean {
    return this.draft !== this.saved;
  }

  private apply(): void {
    const { stencil } = this.result;
    if (!stencil) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent<StencilData>('stencil-change', {
        detail: stencil,
        bubbles: true,
        composed: true
      })
    );
  }

  private revert(): void {
    this.draft = this.saved;
  }

  private renderEditor(): TemplateResult {
    return this.editorReady
      ? html`<oscd-ace-editor
          id="editor"
          .value=${this.draft}
          @change=${(e: CustomEvent<string>) => (this.draft = e.detail ?? '')}
        ></oscd-ace-editor>`
      : html`<p class="muted" id="loading">${msg('Loading the editor…')}</p>`;
  }

  render(): TemplateResult {
    const errors = this.result.errors ?? [];
    const valid = errors.length === 0;

    return html`<h2 class="with-help">
        ${msg('Edit as JSON')}
        <oscd-stencil-help heading=${msg('About the JSON')}>${helpJson()}</oscd-stencil-help>
      </h2>
      <div class="editor">${this.renderEditor()}</div>
      ${valid
        ? nothing
        : html`<div class="problems" role="alert" id="problems">
            <strong>${msg('This cannot be applied yet:')}</strong>
            <ul>
              ${errors.map(error => html`<li>${error}</li>`)}
            </ul>
          </div>`}
      <div class="actions">
        <oscd-text-button
          id="revert"
          ?disabled=${!this.changed}
          @click=${() => this.revert()}
          >${msg('Discard edits')}</oscd-text-button
        >
        <oscd-filled-button
          id="apply"
          ?disabled=${!valid || !this.changed}
          @click=${() => this.apply()}
          >${msg('Save to stencil')}<oscd-icon slot="icon" aria-hidden="true">check</oscd-icon></oscd-filled-button
        >
      </div>`;
  }

  static styles = [
    ...themeStyles,
    css`
      :host {
        color: var(--stencil-text);
        display: block;
        padding: 12px;
      }

      .editor {
        border: 1px solid var(--stencil-border);
        height: 60vh;
      }

      .muted {
        color: var(--stencil-text);
        padding: 12px;
      }

      .problems {
        border-left: 4px solid var(--oscd-error);
        margin: 12px 0;
        padding: 4px 12px;
      }

      .actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        margin-top: 12px;
      }

      .with-help {
        align-items: center;
        display: flex;
        gap: 4px;
      }

      h2 {
        font-weight: 400;
        margin: 0 0 8px;
      }
    `
  ];
}
