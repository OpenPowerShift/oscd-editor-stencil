import { css, html, LitElement, nothing } from 'lit';
import type { PropertyValues, TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { msg, str, updateWhenLocaleChanges } from '@lit/localize';
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

  @state() loadFailed = false;

  /** Whether the stencil changed underneath edits that were not saved. */
  @state() conflict = false;

  /** Set when saving, so that the saved stencil becomes the text. */
  private justSaved = false;

  private checked?: {
    stencil: StencilData;
    scope: JsonScope;
    draft: string;
    result: ReturnType<typeof applyScopeText>;
  };

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
    }).catch(() => {
      this.loadFailed = true;
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
    // Ace starts a worker script, which is not served, as soon as a mode is
    // set while workers are on: turn them off before asking for JSON. The
    // text is checked here instead. Ask for the mode on the element too, as
    // the editor may already ask for JSON (before the mode was loaded), when
    // asking again changes nothing.
    for (let tries = 0; tries < 40; tries += 1) {
      const editor = ace.editor ?? ace.aceEditorBase?.editor;
      if (editor) {
        editor.session.setUseWorker(false);
        if (ace.aceEditorBase) {
          ace.aceEditorBase.mode = JSON_MODE;
        }
        editor.session.setMode(JSON_MODE);
        return;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    }
    if (ace.aceEditorBase) {
      ace.aceEditorBase.mode = JSON_MODE;
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
      const clean = this.draft === '' || this.draft === this.saved;
      if (clean || this.justSaved || changed.has('scope')) {
        // what was saved is shown as stored, which may differ in layout
        this.draft = text;
        this.conflict = false;
      } else if (text !== this.saved) {
        // edits are kept, but they were made to what is no longer there
        this.conflict = true;
      }
      this.justSaved = false;
      this.saved = text;
    }
  }

  /** The edited text checked against the stencil, worked out once per change. */
  private get result(): ReturnType<typeof applyScopeText> {
    const { stencil, scope, draft } = this;
    const checked = this.checked;
    if (
      !checked ||
      checked.stencil !== stencil ||
      checked.scope !== scope ||
      checked.draft !== draft
    ) {
      this.checked = {
        stencil,
        scope,
        draft,
        result: applyScopeText(stencil, scope, draft)
      };
    }
    return this.checked!.result;
  }

  private get changed(): boolean {
    return this.draft !== this.saved;
  }

  private apply(): void {
    const { stencil, scope } = this.result;
    if (!stencil || this.conflict) {
      return;
    }
    this.justSaved = true;
    // a changed name or version moves the scope with it
    if (scope) {
      this.dispatchEvent(
        new CustomEvent<JsonScope>('json-scope-change', {
          detail: scope,
          bubbles: true,
          composed: true
        })
      );
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
    this.conflict = false;
  }

  private heading(): string {
    const scope = this.scope;
    if (scope.kind === 'application') {
      return msg(str`Edit application ${scope.key.name} as JSON`);
    }
    if (scope.kind === 'version') {
      return msg(str`Edit ${scope.key.name} ${scope.version} as JSON`);
    }
    return msg(str`Edit stencil ${this.stencil.name} as JSON`);
  }

  /** Whether there are edits that would be lost. */
  get dirty(): boolean {
    return this.changed;
  }

  private renderEditor(): TemplateResult {
    return this.editorReady
      ? html`<oscd-ace-editor
          id="editor"
          .value=${this.draft}
          @change=${(e: CustomEvent<string>) => (this.draft = e.detail ?? '')}
        ></oscd-ace-editor>`
      : html`<p class="muted" id="loading">
          ${this.loadFailed
            ? msg('The editor could not be loaded. Check the connection and open it again.')
            : msg('Loading the editor…')}
        </p>`;
  }

  render(): TemplateResult {
    const errors = this.result.errors ?? [];
    const valid = errors.length === 0;

    return html`<div class="with-help">
        <h2>${this.heading()}</h2>
        <oscd-stencil-help heading=${msg('About the JSON')}>${helpJson()}</oscd-stencil-help>
      </div>
      ${this.conflict
        ? html`<p class="conflict" role="status" id="conflict">
            ${msg('The stencil was changed elsewhere while you were editing. Discard your edits to see it, then make them again.')}
          </p>`
        : nothing}
      <div class="editor">${this.renderEditor()}</div>
      ${valid
        ? nothing
        : html`<div class="problems" id="problems">
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
          ?disabled=${!valid || !this.changed || this.conflict}
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

      .conflict {
        border-left: 4px solid var(--stencil-danger);
        margin: 8px 0;
        padding: 4px 12px;
      }
    `
  ];
}
