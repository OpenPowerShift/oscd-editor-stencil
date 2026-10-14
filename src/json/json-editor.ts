import { css, html, LitElement, nothing } from 'lit';
import type { PropertyValues, TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { msg, updateWhenLocaleChanges } from '@lit/localize';
import { ScopedElementsMixin } from '@open-wc/scoped-elements/lit-element.js';

import { OscdFilledButton } from '@omicronenergy/oscd-ui/button/OscdFilledButton.js';
import { OscdIcon } from '@omicronenergy/oscd-ui/icon/OscdIcon.js';
import { OscdTextButton } from '@omicronenergy/oscd-ui/button/OscdTextButton.js';

import { parseStencil, serializeStencil } from '../foundation/stencil-io.js';
import type { StencilData } from '../foundation/types.js';
import { themeStyles } from '../theme.js';

/** The Ace editor is large, so it is only loaded when this view is opened. */
const loadAceEditor = async () =>
  (await import('@omicronenergy/oscd-ui/ace-editor/OscdAceEditor.js'))
    .OscdAceEditor;

/**
 * Edits the stencil as JSON, for the changes the forms do not cover.
 *
 * The text is checked as it is typed. Only valid text can be applied, and
 * applying raises `stencil-change` with the parsed stencil.
 */
export class OscdStencilJson extends ScopedElementsMixin(LitElement) {
  static scopedElements = {
    'oscd-filled-button': OscdFilledButton,
    'oscd-icon': OscdIcon,
    'oscd-text-button': OscdTextButton
  };

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  @property({ attribute: false }) stencil!: StencilData;

  /** What is in the editor, which may not be valid yet. */
  @state() draft = '';

  @state() editorReady = false;

  private saved = '';

  connectedCallback(): void {
    super.connectedCallback();
    loadAceEditor().then((OscdAceEditor) => {
      if (!this.registry?.get('oscd-ace-editor')) {
        this.registry?.define('oscd-ace-editor', OscdAceEditor);
      }
      this.editorReady = true;
    });
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('stencil')) {
      const text = serializeStencil(this.stencil);
      // do not lose edits when the stencil is replaced by the same content
      if (this.draft === '' || this.draft === this.saved) {
        this.draft = text;
      }
      this.saved = text;
    }
  }

  private get result(): ReturnType<typeof parseStencil> {
    return parseStencil(this.draft);
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

    return html`<div class="editor">${this.renderEditor()}</div>
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
          >${msg('Revert')}</oscd-text-button
        >
        <oscd-filled-button
          id="apply"
          ?disabled=${!valid || !this.changed}
          @click=${() => this.apply()}
          >${msg('Apply changes')}<oscd-icon slot="icon">check</oscd-icon></oscd-filled-button
        >
      </div>`;
  }

  static styles = [
    ...themeStyles,
    css`
      :host {
        color: var(--oscd-base00);
        display: block;
        padding: 12px;
      }

      .editor {
        border: 1px solid var(--oscd-base1);
        height: 60vh;
      }

      .muted {
        color: var(--oscd-base0);
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
    `
  ];
}
