import { css, html, LitElement, nothing } from 'lit';
import type { PropertyValues, TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { msg, str, updateWhenLocaleChanges } from '@lit/localize';
import { ScopedElementsMixin } from '@open-wc/scoped-elements/lit-element.js';

import { OscdCheckbox } from '@omicronenergy/oscd-ui/checkbox/OscdCheckbox.js';
import { OscdFilledButton } from '@omicronenergy/oscd-ui/button/OscdFilledButton.js';
import { OscdIcon } from '@omicronenergy/oscd-ui/icon/OscdIcon.js';
import { OscdOutlinedTextField } from '@omicronenergy/oscd-ui/textfield/OscdOutlinedTextField.js';
import { OscdSelectionList } from '@omicronenergy/oscd-ui/selection-list/OscdSelectionList.js';
import { OscdSwitch } from '@omicronenergy/oscd-ui/switch/OscdSwitch.js';
import { OscdTextButton } from '@omicronenergy/oscd-ui/button/OscdTextButton.js';

import {
  blockKey,
  buildVersion,
  checkState,
  discoverControlBlocks,
  functionNameProblems,
  involvedIeds,
  setChosen,
  suggestFunctionNames,
  untaggedIeds
} from '../foundation/capture.js';
import type { CheckState } from '../foundation/capture.js';
import { iedSelectItems } from '../foundation/ied-items.js';
import type { IedSelectItem } from '../foundation/ied-items.js';
import type { ControlBlockInfo } from '../foundation/mapping-info.js';
import { buildMatrix } from '../foundation/mapping-matrix.js';
import {
  hasApplicationVersion,
  summarizeVersion,
  upsertApplicationVersion
} from '../foundation/stencil-model.js';
import type { Application, StencilData } from '../foundation/types.js';
import { OscdStencilMappingTable } from '../shared/mapping-table.js';
import { problemText } from '../shared/problem-text.js';
import { OscdStencilHelp } from '../shared/help.js';
import {
  helpCapture,
  helpCaptureBlocks,
  helpCaptureNames,
  helpTags
} from '../shared/help-content.js';
import { themeStyles } from '../theme.js';

type Step = 'ieds' | 'blocks' | 'details' | 'review' | 'done';

/** Raised when the captured version is saved: the whole new stencil. */
export type StencilCaptureDetail = {
  stencil: StencilData;
  category: string;
  name: string;
  version: string;
};

const steps: { id: Exclude<Step, 'done'>; label: () => string }[] = [
  { id: 'ieds', label: () => msg('Select IEDs') },
  { id: 'blocks', label: () => msg('Select control blocks') },
  { id: 'details', label: () => msg('Name the application') },
  { id: 'review', label: () => msg('Review and save') }
];

type Details = {
  category: string;
  name: string;
  description: string;
  version: string;
  versionDescription: string;
};

const emptyDetails = (): Details => ({
  category: '',
  name: '',
  description: '',
  version: '1.0.0',
  versionDescription: ''
});

/**
 * Makes a stencil application from the document that is open: choose the
 * IEDs, choose which of the control blocks between them to keep, name the
 * application and its functions, then review and save.
 *
 * It does not change the stencil. Saving raises `stencil-capture` with the
 * whole new stencil, and `stencil-tag` asks the plugin to tag IEDs.
 */
export class OscdStencilCapture extends ScopedElementsMixin(LitElement) {
  static scopedElements = {
    'oscd-checkbox': OscdCheckbox,
    'oscd-filled-button': OscdFilledButton,
    'oscd-icon': OscdIcon,
    'oscd-stencil-help': OscdStencilHelp,
    'oscd-outlined-text-field': OscdOutlinedTextField,
    'oscd-selection-list': OscdSelectionList,
    'oscd-stencil-mapping-table': OscdStencilMappingTable,
    'oscd-switch': OscdSwitch,
    'oscd-text-button': OscdTextButton
  };

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  @property({ attribute: false }) doc?: XMLDocument;

  @property({ attribute: false }) stencil!: StencilData;

  @state() step: Step = 'ieds';

  /** One entry per IED. The selection list keeps the selection in them. */
  @state() items: IedSelectItem[] = [];

  @state() blocks: ControlBlockInfo[] = [];

  @state() chosen: ReadonlySet<string> = new Set();

  @state() names: Record<string, string> = {};

  @state() details: Details = emptyDetails();

  @state() replace = false;

  @state() saved: Application | undefined;

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('doc')) {
      this.reset();
    }
  }

  /** Starts again, with the IEDs of the document. */
  reset(): void {
    this.step = 'ieds';
    this.items = iedSelectItems(this.doc);
    this.blocks = [];
    this.chosen = new Set();
    this.names = {};
    this.details = emptyDetails();
    this.replace = false;
    this.saved = undefined;
  }

  private get selectedIeds(): string[] {
    return this.items
      .filter(item => item.selected)
      .map(item => item.attachedElement.getAttribute('name')!);
  }

  private chooseAll(selected: boolean): void {
    this.items = this.items.map(item => ({ ...item, selected }));
  }

  private get chosenBlocks(): ControlBlockInfo[] {
    return this.blocks.filter(block => this.chosen.has(blockKey(block)));
  }

  private get version(): Application | undefined {
    return this.doc
      ? buildVersion(this.doc, this.chosenBlocks, this.names, {
        version: this.details.version,
        description: this.details.versionDescription,
        deprecated: false
      })
      : undefined;
  }

  private get nameProblems(): Record<string, string> {
    return functionNameProblems(
      Object.fromEntries(
        involvedIeds(this.chosenBlocks).map(ied => [ied, this.names[ied] ?? ''])
      )
    );
  }

  private get detailsComplete(): boolean {
    const { category, name, version } = this.details;
    return (
      [category, name, version].every(value => value.trim() !== '') &&
      Object.keys(this.nameProblems).length === 0
    );
  }

  private get exists(): boolean {
    return hasApplicationVersion(
      this.stencil,
      {
        category: this.details.category.trim(),
        name: this.details.name.trim()
      },
      this.details.version.trim()
    );
  }

  private findBlocks(): void {
    this.blocks = discoverControlBlocks(this.doc!, this.selectedIeds);
    this.chosen = new Set(this.blocks.map(blockKey));
    this.step = 'blocks';
  }

  private toDetails(): void {
    const ieds = involvedIeds(this.chosenBlocks);
    this.names = { ...suggestFunctionNames(ieds), ...this.names };
    this.step = 'details';
  }

  private save(): void {
    const version = this.version;
    if (!version) {
      return;
    }
    const key = {
      category: this.details.category.trim(),
      name: this.details.name.trim()
    };
    const stencil = upsertApplicationVersion(
      this.stencil,
      { ...key, description: this.details.description },
      version
    );
    this.saved = version;
    this.step = 'done';
    this.dispatchEvent(
      new CustomEvent<StencilCaptureDetail>('stencil-capture', {
        detail: { stencil, ...key, version: version.version },
        bubbles: true,
        composed: true
      })
    );
  }

  private go(tab: 'apply' | 'manage'): void {
    this.dispatchEvent(
      new CustomEvent('stencil-goto', {
        detail: tab,
        bubbles: true,
        composed: true
      })
    );
  }

  private check(blocks: ControlBlockInfo[], event: Event): void {
    this.chosen = setChosen(
      this.chosen,
      blocks,
      (event.target as OscdCheckbox).checked
    );
  }

  private renderSteps(): TemplateResult {
    const current = steps.findIndex(step => step.id === this.step);

    return html`<ol class="steps" aria-label="${msg('Progress')}">
      ${steps.map(
        (step, i) => html`<li
          class="${i === current ? 'current' : i < current || this.step === 'done' ? 'complete' : ''}"
          aria-current=${ifDefined(i === current ? 'step' : undefined)}
        >
          <span class="number"
            >${i < current || this.step === 'done'
              ? html`<oscd-icon aria-hidden="true">check</oscd-icon>`
              : i + 1}</span
          >
          ${step.label()}
        </li>`
      )}
    </ol>`;
  }

  private renderIeds(): TemplateResult {
    return html`<div class="card">
      <h2 class="with-help">
        ${msg('Which IEDs make up the application?')}
        <oscd-stencil-help heading=${msg('Capturing an application')}>${helpCapture()}</oscd-stencil-help>
      </h2>
      <p class="muted">
        ${msg('Choose at least two. The control blocks one of them sends to another are the application.')}
      </p>
      <div class="list-tools">
        <oscd-text-button
          id="select-all"
          ?disabled=${this.items.every(item => item.selected)}
          @click=${() => this.chooseAll(true)}
          >${msg('Select all')}</oscd-text-button
        >
        <oscd-text-button
          id="select-none"
          ?disabled=${!this.items.some(item => item.selected)}
          @click=${() => this.chooseAll(false)}
          >${msg('Select none')}</oscd-text-button
        >
      </div>
      <oscd-selection-list
        id="ieds"
        filterable
        multiselect
        .items=${this.items}
        @selection-list-change=${() => this.requestUpdate()}
      ></oscd-selection-list>
      <div class="actions">
        <span class="spacer"></span>
        <oscd-filled-button
          id="next"
          ?disabled=${this.selectedIeds.length < 2}
          @click=${() => this.findBlocks()}
          >${msg('Next')}<oscd-icon slot="icon" aria-hidden="true">arrow_forward</oscd-icon></oscd-filled-button
        >
      </div>
    </div>`;
  }

  private checkbox(
    id: string,
    label: string,
    state: CheckState,
    blocks: ControlBlockInfo[]
  ): TemplateResult {
    return html`<oscd-checkbox
      id=${id}
      touch-target="wrapper"
      aria-label=${label}
      .checked=${state === 'all'}
      .indeterminate=${state === 'some'}
      @change=${(e: Event) => this.check(blocks, e)}
    ></oscd-checkbox>`;
  }

  private renderBlocks(): TemplateResult {
    const { columns, rows } = buildMatrix(this.blocks);

    if (this.blocks.length === 0) {
      return html`<div class="card">
        <p id="none" class="reason">
          <oscd-icon aria-hidden="true">info</oscd-icon>${msg('None of the chosen IEDs is subscribed to another one, so there is nothing to capture. Go back and choose other IEDs.')}
        </p>
        <div class="actions">
          <oscd-text-button id="back" @click=${() => (this.step = 'ieds')}
            >${msg('Back')}</oscd-text-button
          >
        </div>
      </div>`;
    }

    return html`<div class="card wide">
      <h2 class="with-help">
        ${msg('Which control blocks belong to the application?')}
        <oscd-stencil-help heading=${msg('Choosing control blocks')}>${helpCaptureBlocks()}</oscd-stencil-help>
      </h2>
      <p class="muted">
        ${msg('Untick what should not be part of it. Ticking a row, a column or an IED ticks all of its cells.')}
      </p>
      <div class="scroll">
        <table id="blocks">
          <thead>
            <tr>
              <th scope="col" class="corner">${msg('From')} \\ ${msg('To')}</th>
              ${columns.map(
                to => html`<th scope="col">
                  ${this.checkbox(
                    `col-${to}`,
                    `${msg('All sent to')} ${to}`,
                    checkState(
                      this.blocks.filter(block => block.to === to),
                      this.chosen
                    ),
                    this.blocks.filter(block => block.to === to)
                  )}
                  ${to}
                </th>`
              )}
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => {
              const fromBlocks = this.blocks.filter(
                block => block.from === row.from
              );
              return html`<tr class="publisher">
                  <th scope="rowgroup" colspan="${columns.length + 1}">
                    <span class="group">
                    ${this.checkbox(
                      `ied-${row.from}`,
                      `${msg('All sent by')} ${row.from}`,
                      checkState(fromBlocks, this.chosen),
                      fromBlocks
                    )}
                    ${row.from}
                    </span>
                  </th>
                </tr>
                ${row.blocks.map((block) => {
                  const rowBlocks = fromBlocks.filter(
                    candidate => candidate.id === block.id
                  );
                  return html`<tr>
                    <th scope="row" class="block">
                      ${this.checkbox(
                        `row-${row.from}-${block.id}`,
                        `${msg('All of')} ${block.label}`,
                        checkState(rowBlocks, this.chosen),
                        rowBlocks
                      )}
                      ${block.label}
                    </th>
                    ${block.cells.map((cell) => {
                      if (!cell) {
                        return html`<td></td>`;
                      }
                      const isGoose = cell.block.type === 'GSEControl';
                      return html`<td class="cell">
                        ${this.checkbox(
                          `cell-${blockKey(cell.block)}`,
                          `${row.from} › ${block.label} › ${cell.block.to}`,
                          checkState([cell.block], this.chosen),
                          [cell.block]
                        )}
                        <oscd-icon
                          class="${isGoose ? 'goose' : 'smv'}"
                          role="img"
                          aria-label="${isGoose ? msg('GOOSE') : msg('Sampled values')}"
                          >${isGoose ? 'gooseIcon' : 'smvIcon'}</oscd-icon
                        >
                        <span class="count">${cell.block.mappings.length}</span>
                      </td>`;
                    })}
                  </tr>`;
                })}`;
            })}
          </tbody>
        </table>
      </div>
      <div class="actions">
        <oscd-text-button id="back" @click=${() => (this.step = 'ieds')}
          >${msg('Back')}</oscd-text-button
        >
        <span class="spacer"></span>
        <oscd-filled-button
          id="next"
          ?disabled=${this.chosen.size === 0}
          @click=${() => this.toDetails()}
          >${msg('Next')}<oscd-icon slot="icon" aria-hidden="true">arrow_forward</oscd-icon></oscd-filled-button
        >
      </div>
    </div>`;
  }

  private detailField(
    id: keyof Details,
    label: string,
    multiline = false,
    required = false
  ): TemplateResult {
    return html`<oscd-outlined-text-field
      id=${id}
      ?required=${required}
      label=${label}
      type=${multiline ? 'textarea' : 'text'}
      .value=${this.details[id]}
      @input=${(e: Event) => {
        this.details = {
          ...this.details,
          [id]: (e.target as OscdOutlinedTextField).value
        };
      }}
    ></oscd-outlined-text-field>`;
  }

  private renderDetails(): TemplateResult {
    const problems = this.nameProblems;

    return html`<div class="card">
      <h2 class="with-help">
        ${msg('Name the application')}
        <oscd-stencil-help heading=${msg('Naming the application and its functions')}>${helpCaptureNames()}</oscd-stencil-help>
      </h2>
      <div class="fields">
        ${this.detailField('category', msg('Category'), false, true)}
        ${this.detailField('name', msg('Name'), false, true)}
        ${this.detailField('description', msg('Description'), true)}
        ${this.detailField('version', msg('Version'), false, true)}
        ${this.detailField('versionDescription', msg('Version description'), true)}
      </div>

      <h3>${msg('Functions')}</h3>
      <p class="muted">
        ${msg('Each IED becomes a function with a name of its own. Applying the stencil assigns an IED to each function.')}
      </p>
      <div class="fields">
        ${involvedIeds(this.chosenBlocks).map(
          ied => html`<oscd-outlined-text-field
            data-ied=${ied}
            label=${`${msg('Function for')} ${ied}`}
            .value=${this.names[ied] ?? ''}
            .error=${!!problems[ied]}
            .errorText=${problems[ied] ? problemText(problems[ied]) : ''}
            @input=${(e: Event) => {
              this.names = {
                ...this.names,
                [ied]: (e.target as OscdOutlinedTextField).value
              };
            }}
          ></oscd-outlined-text-field>`
        )}
      </div>
      ${this.detailsComplete
        ? nothing
        : html`<p class="muted" id="details-hint">
            ${msg('Fill in category, name and version, and give each function a different name, to continue.')}
          </p>`}
      <div class="actions">
        <oscd-text-button id="back" @click=${() => (this.step = 'blocks')}
          >${msg('Back')}</oscd-text-button
        >
        <span class="spacer"></span>
        <oscd-filled-button
          id="next"
          ?disabled=${!this.detailsComplete}
          @click=${() => {
            this.replace = false;
            this.step = 'review';
          }}
          >${msg('Next')}<oscd-icon slot="icon" aria-hidden="true">arrow_forward</oscd-icon></oscd-filled-button
        >
      </div>
    </div>`;
  }

  private renderReview(): TemplateResult {
    const version = this.version!;
    const summary = summarizeVersion(version);
    const untagged = untaggedIeds(this.doc!, involvedIeds(this.chosenBlocks));
    const exists = this.exists;

    return html`<div class="card wide" id="review">
      <h2>
        ${this.details.category.trim()} › ${this.details.name.trim()}
        <code>${version.version}</code>
      </h2>
      <p>
        ${msg(
          str`${summary.functions} IEDs, ${summary.goose} GOOSE, ${summary.smv} SV, ${summary.subscriptions} subscriptions, ${summary.supervisions} supervisions`
        )}
      </p>
      ${untagged.length > 0
        ? html`<p class="reason" id="untagged" role="note">
            <oscd-icon aria-hidden="true">info</oscd-icon>
            <span
              >${msg(str`These IEDs have no stencil tag, so any IED of the same manufacturer and type will match their function: ${untagged.join(', ')}.`)}
              <oscd-stencil-help heading=${msg('Stencil tags')}>${helpTags()}</oscd-stencil-help>
              <oscd-text-button id="tag" @click=${() => this.dispatchEvent(new CustomEvent('stencil-tag', { bubbles: true, composed: true }))}
                >${msg('Tag IEDs…')}</oscd-text-button
              ></span
            >
          </p>`
        : nothing}
      ${exists
        ? html`<label class="replace" id="exists"
            ><oscd-checkbox
              id="replace"
              touch-target="wrapper"
              .checked=${this.replace}
              @change=${(e: Event) =>
                (this.replace = (e.target as OscdCheckbox).checked)}
            ></oscd-checkbox
            >${msg(str`Version ${version.version} of this application exists. Replace it.`)}</label
          >`
        : nothing}
      <oscd-stencil-mapping-table
        .controlBlocks=${version.ControlBlocks}
      ></oscd-stencil-mapping-table>
      <div class="actions">
        <oscd-text-button id="back" @click=${() => (this.step = 'details')}
          >${msg('Back')}</oscd-text-button
        >
        <span class="spacer"></span>
        <oscd-filled-button
          id="save"
          ?disabled=${exists && !this.replace}
          @click=${() => this.save()}
          >${msg('Save to stencil')}<oscd-icon slot="icon" aria-hidden="true">save</oscd-icon></oscd-filled-button
        >
      </div>
    </div>`;
  }

  private renderDone(): TemplateResult {
    return html`<div class="card" id="done" role="status">
      <h2>${msg('Saved')}</h2>
      <p>
        ${msg(
          str`${this.details.category.trim()} › ${this.details.name.trim()} ${this.saved?.version ?? ''} is in the stencil.`
        )}
      </p>
      <p class="muted">
        ${msg(str`It is kept in this browser as part of ${this.stencil.name} ${this.stencil.version}. Export it from Manage to keep a copy.`)}
      </p>
      <div class="actions">
        <oscd-text-button id="another" @click=${() => this.reset()}
          >${msg('Capture another')}</oscd-text-button
        >
        <span class="spacer"></span>
        <oscd-filled-button id="manage" @click=${() => this.go('manage')}
          >${msg('Show in stencils')}<oscd-icon slot="icon" aria-hidden="true">folder_managed</oscd-icon></oscd-filled-button
        >
      </div>
    </div>`;
  }

  render(): TemplateResult {
    if (!this.doc) {
      return html`<p class="hint">${msg('Please open a file to capture a stencil application.')}</p>`;
    }

    return html`${this.renderSteps()}
    ${this.step === 'ieds' ? this.renderIeds() : nothing}
    ${this.step === 'blocks' ? this.renderBlocks() : nothing}
    ${this.step === 'details' ? this.renderDetails() : nothing}
    ${this.step === 'review' && this.version ? this.renderReview() : nothing}
    ${this.step === 'done' ? this.renderDone() : nothing}`;
  }

  static styles = [
    ...themeStyles,
    css`
      :host {
        color: var(--stencil-text);
        container-type: inline-size;
        display: block;
        padding: 12px;
      }

      h2,
      h3 {
        font-weight: 400;
        margin: 0 0 16px;
      }

      h3 {
        margin-top: 28px;
      }

      p {
        margin: 8px 0;
      }

      .muted {
        color: var(--stencil-text);
      }

      .hint {
        color: var(--stencil-text);
        padding: 24px 8px;
      }

      .steps {
        display: flex;
        flex-wrap: wrap;
        gap: 24px;
        list-style: none;
        margin: 0 0 16px;
        padding: 0;
      }

      .steps li {
        align-items: center;
        color: var(--stencil-text);
        display: flex;
        gap: 8px;
      }

      .steps li.current {
        color: var(--oscd-base03);
        font-weight: 600;
      }

      .steps li.current .number {
        border-color: var(--oscd-primary);
        border-width: 2px;
      }

      .steps li.complete .number {
        background: var(--oscd-primary);
        border-color: var(--oscd-primary);
        color: var(--oscd-base03);
      }

      @container (max-width: 560px) {
        .steps {
          flex-direction: column;
          gap: 8px;
        }
      }

      .steps li.complete {
        color: var(--stencil-text);
      }

      .number {
        align-items: center;
        border: 1px solid currentcolor;
        border-radius: 50%;
        display: inline-flex;
        height: 24px;
        justify-content: center;
        width: 24px;
      }

      .number oscd-icon {
        --md-icon-size: 16px;
      }

      .card {
        background: var(--oscd-base2);
        border-radius: var(--md-sys-shape-corner-medium);
        margin-bottom: 16px;
        max-width: 720px;
        padding: 16px 20px;
      }

      .card.wide {
        overflow-x: auto;
        max-width: 1100px;
      }

      oscd-selection-list {
        max-height: 50vh;
        overflow-y: auto;
      }

      p + .fields {
        margin-top: 12px;
      }

      .list-tools {
        display: flex;
        gap: 8px;
        margin-bottom: 4px;
      }

      .fields {
        display: grid;
        gap: 12px;
        max-width: 560px;
      }

      .actions {
        align-items: center;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 16px;
      }

      .spacer {
        flex: 1;
      }

      .reason {
        align-items: center;
        display: flex;
        gap: 8px;
      }

      .replace {
        align-items: center;
        display: flex;
        gap: 8px;
        margin: 8px 0;
      }

      .scroll {
        max-height: 60vh;
        overflow: auto;
      }

      table {
        border-collapse: separate;
        border-spacing: 0;
        width: 100%;
      }

      th,
      td {
        border-bottom: 1px solid var(--stencil-border);
        border-right: 1px solid var(--stencil-border);
        padding: 4px 8px;
        text-align: left;
      }

      thead th {
        background: var(--oscd-base2);
        position: sticky;
        top: 0;
        z-index: 2;
      }

      tr.publisher th {
        background: var(--oscd-base3);
      }

      /* the row spans the whole table, so its text sticks, not the cell */
      .group {
        display: inline-block;
        left: 8px;
        position: sticky;
      }

      th.corner,
      th.block {
        left: 0;
        position: sticky;
        z-index: 1;
      }

      th.corner {
        z-index: 3;
      }

      th.block {
        background: var(--oscd-base2);
        font-weight: 400;
        padding-left: 24px;
        white-space: nowrap;
      }

      td.cell {
        white-space: nowrap;
      }

      th oscd-checkbox,
      td oscd-checkbox,
      td oscd-icon {
        vertical-align: middle;
      }

      th oscd-checkbox {
        margin-right: 8px;
      }

      oscd-icon.goose {
        color: var(--stencil-goose-color);
      }

      oscd-icon.smv {
        color: var(--stencil-sv-color);
      }

      .count {
        margin-left: 4px;
      }

      .with-help {
        align-items: center;
        display: flex;
        gap: 4px;
      }
    `
  ];
}
