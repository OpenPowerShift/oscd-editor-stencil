import { css, html, LitElement } from 'lit';
import type { TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { msg, updateWhenLocaleChanges } from '@lit/localize';
import { ScopedElementsMixin } from '@open-wc/scoped-elements/lit-element.js';
import { prefersReducedMotion } from './motion.js';

import { OscdDialog } from '@omicronenergy/oscd-ui/dialog/OscdDialog.js';
import { OscdIcon } from '@omicronenergy/oscd-ui/icon/OscdIcon.js';
import { OscdIconButton } from '@omicronenergy/oscd-ui/iconbutton/OscdIconButton.js';
import { OscdTextButton } from '@omicronenergy/oscd-ui/button/OscdTextButton.js';

import { themeStyles } from '../theme.js';

/**
 * A help icon that opens a small dialog with a longer explanation.
 *
 * The explanation is given as the content of the element, so the text
 * belongs to (and is translated by) the view that uses it:
 *
 * ```html
 * <oscd-stencil-help heading="What is this?"><p>…</p></oscd-stencil-help>
 * ```
 */
export class OscdStencilHelp extends ScopedElementsMixin(LitElement) {
  static scopedElements = {
    'oscd-dialog': OscdDialog,
    'oscd-icon': OscdIcon,
    'oscd-icon-button': OscdIconButton,
    'oscd-text-button': OscdTextButton
  };

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  /** The title of the dialog, which also names the icon for screen readers. */
  @property() heading = '';

  @state() open = false;

  render(): TemplateResult {
    const label = `${msg('Help')}: ${this.heading}`;

    return html`<oscd-icon-button
        id="open"
        aria-label=${label}
        title=${label}
        @click=${() => (this.open = true)}
        ><oscd-icon aria-hidden="true">help</oscd-icon></oscd-icon-button
      >
      <oscd-dialog
        ?quick=${prefersReducedMotion()}
        id="dialog"
        ?open=${this.open}
        @closed=${(e: Event) => {
          if (e.target === e.currentTarget) {
            this.open = false;
          }
        }}
      >
        <div slot="headline">${this.heading}</div>
        <div slot="content" class="content"><slot></slot></div>
        <div slot="actions">
          <oscd-text-button id="close" @click=${() => (this.open = false)}
            >${msg('Close')}</oscd-text-button
          >
        </div>
      </oscd-dialog>`;
  }

  static styles = [
    ...themeStyles,
    css`
      :host {
        display: inline-flex;
        vertical-align: middle;
      }

      #open {
        --md-icon-button-icon-color: var(--stencil-text);
        --md-icon-button-icon-size: 22px;
      }

      oscd-dialog {
        --md-dialog-headline-color: var(--stencil-text);
        --md-dialog-supporting-text-color: var(--stencil-text);
      }

      .content {
        color: var(--stencil-text);
        max-width: 560px;
      }

      ::slotted(p),
      ::slotted(ul),
      ::slotted(dl) {
        margin: 0 0 12px;
      }

      ::slotted(ul) {
        padding-left: 20px;
      }
    `
  ];
}
