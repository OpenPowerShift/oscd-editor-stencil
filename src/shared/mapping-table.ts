import { css, html, LitElement, nothing } from 'lit';
import type { TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { msg, str, updateWhenLocaleChanges } from '@lit/localize';
import { ScopedElementsMixin } from '@open-wc/scoped-elements/lit-element.js';

import { OscdIcon } from '@omicronenergy/oscd-ui/icon/OscdIcon.js';
import { OscdSwitch } from '@omicronenergy/oscd-ui/switch/OscdSwitch.js';

import type { ControlBlockInfo } from '../foundation/mapping-info.js';
import {
  buildMatrix,
  refLabel,
  supervisionLabel
} from '../foundation/mapping-matrix.js';
import { OscdStencilHelp } from './help.js';
import { helpMappingTable } from './help-content.js';
import { themeStyles } from '../theme.js';

/** What applying a stencil did to one control block, shown on its cell. */
export type CellMarker = {
  kind: 'new' | 'present' | 'error' | 'skipped';
  label: string;
};

/**
 * The control blocks of a stencil version as a table: publishing functions
 * down the side, subscribing functions across the top, and in each cell the
 * kind of control block, how many signals it carries, and its supervision.
 *
 * It only shows. `assignment` adds the chosen IED under each function, and
 * `markers` marks cells with what applying did, by `cellKey`.
 */
export class OscdStencilMappingTable extends ScopedElementsMixin(LitElement) {
  static scopedElements = {
    'oscd-icon': OscdIcon,
    'oscd-stencil-help': OscdStencilHelp,
    'oscd-switch': OscdSwitch
  };

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  @property({ attribute: false }) controlBlocks: ControlBlockInfo[] = [];

  /** The IED chosen for each function. */
  @property({ attribute: false }) assignment: ReadonlyMap<string, string> =
    new Map();

  @property({ attribute: false }) markers: ReadonlyMap<string, CellMarker> =
    new Map();

  @state() showSupervisions = true;

  private functionHeader(name: string): TemplateResult {
    const ied = this.assignment.get(name);
    return html`${name}${ied ? html`<span class="ied">${ied}</span>` : nothing}`;
  }

  private renderCell(
    cell: ReturnType<typeof buildMatrix>['rows'][number]['blocks'][number]['cells'][number],
    diagonal: boolean
  ): TemplateResult {
    if (!cell) {
      return html`<td class="${diagonal ? 'diagonal' : ''}"></td>`;
    }

    const { block, key } = cell;
    const isGoose = block.type === 'GSEControl';
    const marker = this.markers.get(key);

    return html`<td class="mapped ${diagonal ? 'diagonal' : ''}">
      <span class="service ${isGoose ? 'goose' : 'smv'}">
        <oscd-icon
          role="img"
 aria-hidden="false"
          aria-label="${isGoose ? msg('GOOSE') : msg('Sampled values')}"
          >${isGoose ? 'gooseIcon' : 'smvIcon'}</oscd-icon
        >
        <span class="count" title="${msg('Signals')}">${block.mappings.length}</span>
      </span>
      ${this.showSupervisions
        ? html`<span class="supervision" title="${msg('Supervision')}"
            >${supervisionLabel(block.supervision)}</span
          >`
        : nothing}
      ${block.selSupervision
        ? html`<span class="quality" title="${msg('SEL message quality')}"
            ><oscd-icon aria-hidden="true">fact_check</oscd-icon>${msg('Quality')}
            <strong>${block.selSupervision.name}</strong></span
          >`
        : nothing}
      ${marker
        ? html`<span class="marker ${marker.kind}">${marker.label}</span>`
        : nothing}
    </td>`;
  }

  render(): TemplateResult {
    if (this.controlBlocks.length === 0) {
      return html`<p class="empty">${msg('This version has no control blocks.')}</p>`;
    }

    const { columns, rows } = buildMatrix(this.controlBlocks);

    return html`<div class="tools">
        <label class="switch"
          ><oscd-switch
            aria-label=${msg('Show supervisions')}
            touch-target="wrapper"
            ?selected=${this.showSupervisions}
            @change=${() => (this.showSupervisions = !this.showSupervisions)}
          ></oscd-switch
          >${msg('Show supervisions')}</label
        >
        <oscd-stencil-help heading=${msg('Reading this table')}>${helpMappingTable()}</oscd-stencil-help>
      </div>
      <div class="scroll">
        <table>
          <caption>
            ${msg(str`Control blocks from ${rows.length} IEDs to ${columns.length} IEDs`)}
          </caption>
          <thead>
            <tr>
              <th scope="col" class="corner">${msg('From')} \\ ${msg('To')}</th>
              ${columns.map(
                to => html`<th scope="col">${this.functionHeader(to)}</th>`
              )}
            </tr>
          </thead>
          <tbody>
            ${rows.map(
              row => html`<tr class="publisher">
                  <th scope="rowgroup" colspan="${columns.length + 1}">
                    <span class="group">${this.functionHeader(row.from)}</span>
                  </th>
                </tr>
                ${row.blocks.map(
                  block => html`<tr>
                    <th scope="row" class="block">${refLabel(block.id)}</th>
                    ${block.cells.map((cell, i) =>
                      this.renderCell(cell, columns[i] === row.from)
                    )}
                  </tr>`
                )}`
            )}
          </tbody>
        </table>
      </div>`;
  }

  static styles = [
    ...themeStyles,
    css`
      :host {
        color: var(--stencil-text);
        display: block;
      }

      .empty {
        color: var(--stencil-text);
      }

      .tools {
        align-items: center;
        display: flex;
        flex-wrap: wrap;
        gap: 8px 16px;
        margin-bottom: 8px;
      }

      .tools .switch {
        margin-bottom: 0;
      }

      .switch {
        align-items: center;
        display: flex;
        gap: 12px;
        margin-bottom: 8px;
      }

      /* the columns are only as wide as their content, and a scrollbar only
         appears when the table is wider than the room it has */
      .scroll {
        max-height: 60vh;
        overflow: auto;
      }

      table {
        border-collapse: separate;
        border-spacing: 0;
        width: max-content;
      }

      caption {
        height: 1px;
        overflow: hidden;
        position: absolute;
        width: 1px;
      }

      th,
      td {
        border-bottom: 1px solid var(--stencil-border);
        border-right: 1px solid var(--stencil-border);
        padding: 4px 8px;
        text-align: left;
        vertical-align: top;
      }

      thead th {
        background: var(--oscd-base2);
        position: sticky;
        top: 0;
        z-index: 2;
      }

      th.block {
        background: var(--oscd-base3);
        font-weight: 400;
        left: 0;
        position: sticky;
        white-space: nowrap;
        z-index: 1;
      }

      th.corner {
        left: 0;
        z-index: 3;
      }

      tr.publisher th {
        background: var(--oscd-base2);
        left: 0;
        position: sticky;
      }

      /* the row spans the whole table, so its text sticks, not the cell */
      .group {
        display: inline-block;
        left: 8px;
        position: sticky;
      }

      .ied {
        color: var(--stencil-text);
        display: block;
        font-weight: 400;
      }

      td.diagonal {
        background: color-mix(in srgb, var(--oscd-primary) 15%, transparent);
      }

      td.mapped {
        min-width: 5.5rem;
      }

      .service {
        align-items: center;
        display: inline-flex;
        gap: 4px;
      }

      .service.goose {
        color: var(--stencil-goose-color);
      }

      .service.smv {
        color: var(--stencil-sv-color);
      }

      .supervision {
        color: var(--stencil-text);
        display: block;
        font-size: 0.8125rem;
      }

      /* the SEL message quality input: a dashed badge, shown even when the
         supervisions are hidden */
      .quality {
        align-items: center;
        background: color-mix(in srgb, var(--stencil-quality) 12%, transparent);
        border: 1px dashed var(--stencil-quality);
        border-radius: 999px;
        color: var(--stencil-text);
        display: inline-flex;
        font-size: 0.8125rem;
        gap: 4px;
        margin-top: 4px;
        padding: 0 8px 0 4px;
      }

      .quality oscd-icon {
        --md-icon-size: 16px;
        color: var(--stencil-quality);
      }

      .marker {
        display: block;
        font-size: 0.8125rem;
        font-weight: 500;
      }

      .marker.new {
        color: var(--oscd-base03);
        font-weight: 600;
      }

      .marker.error {
        color: var(--stencil-danger);
      }

      .marker.present,
      .marker.skipped {
        color: var(--stencil-text);
      }

      .marker.skipped {
        font-style: italic;
      }

      /* the signal count is text, so it uses the text colour, not the service colour */
      .count {
        color: var(--stencil-text);
      }
    `
  ];
}
