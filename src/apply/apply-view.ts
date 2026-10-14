import { css, html, LitElement, nothing } from 'lit';
import type { PropertyValues, TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { msg, str, updateWhenLocaleChanges } from '@lit/localize';
import { ScopedElementsMixin } from '@open-wc/scoped-elements/lit-element.js';

import { OscdFilledButton } from '@omicronenergy/oscd-ui/button/OscdFilledButton.js';
import { OscdIcon } from '@omicronenergy/oscd-ui/icon/OscdIcon.js';
import { OscdOutlinedButton } from '@omicronenergy/oscd-ui/button/OscdOutlinedButton.js';
import { OscdOutlinedSelect } from '@omicronenergy/oscd-ui/select/OscdOutlinedSelect.js';
import { OscdSelectionList } from '@omicronenergy/oscd-ui/selection-list/OscdSelectionList.js';
import type { SelectItem } from '@omicronenergy/oscd-ui/selection-list/OscdSelectionList.js';
import { OscdSelectOption } from '@omicronenergy/oscd-ui/select/OscdSelectOption.js';
import { OscdSwitch } from '@omicronenergy/oscd-ui/switch/OscdSwitch.js';
import { OscdTextButton } from '@omicronenergy/oscd-ui/button/OscdTextButton.js';
import type { EditV2 } from '@openscd/oscd-api';

import {
  autoAssign,
  candidateIeds,
  describeRequirement,
  functionNames,
  noCandidateReason
} from '../foundation/candidates.js';
import { getIedDescription } from '../foundation/ied-description.js';
import { planApply } from '../foundation/plan-apply.js';
import type { ApplyPlan, PartStatus } from '../foundation/plan-apply.js';
import {
  defaultVersion,
  selectableVersions,
  summarizeVersion,
  visibleApplications
} from '../foundation/stencil-model.js';
import type {
  Application,
  StencilData,
  VersionedApplications
} from '../foundation/types.js';
import { cellKey } from '../foundation/mapping-matrix.js';
import { OscdStencilMappingTable } from '../shared/mapping-table.js';
import type { CellMarker } from '../shared/mapping-table.js';
import { themeStyles } from '../theme.js';

export type Step = 'choose' | 'assign' | 'review' | 'done';

/** Raised when the user applies the stencil. */
export type StencilApplyDetail = {
  edits: EditV2[];
  title: string;
  plan: ApplyPlan;
};

const steps: { id: Exclude<Step, 'done'>; label: () => string }[] = [
  { id: 'choose', label: () => msg('Choose application') },
  { id: 'assign', label: () => msg('Assign IEDs') },
  { id: 'review', label: () => msg('Review and apply') }
];

const statusText: Record<PartStatus, () => string> = {
  new: () => msg('New'),
  present: () => msg('Already present'),
  none: () => msg('None'),
  error: () => msg('Not found')
};

/**
 * Applies a stencil to the document in three steps: choose an application,
 * assign an IED to each of its functions, then review what will change.
 *
 * It does not change the document. Applying raises `stencil-apply` with the
 * edits, for the plugin to commit as one transaction.
 */
export class OscdStencilApply extends ScopedElementsMixin(LitElement) {
  static scopedElements = {
    'oscd-filled-button': OscdFilledButton,
    'oscd-icon': OscdIcon,
    'oscd-outlined-button': OscdOutlinedButton,
    'oscd-outlined-select': OscdOutlinedSelect,
    'oscd-select-option': OscdSelectOption,
    'oscd-stencil-mapping-table': OscdStencilMappingTable,
    'oscd-selection-list': OscdSelectionList,
    'oscd-switch': OscdSwitch,
    'oscd-text-button': OscdTextButton
  };

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  @property({ attribute: false }) doc?: XMLDocument;

  @property({ attribute: false }) stencil!: StencilData;

  @state() step: Step = 'choose';

  @state() showDeprecated = false;

  @state() application: VersionedApplications | null = null;

  @state() version: Application | undefined;

  @state() assignment: ReadonlyMap<string, string> = new Map();

  @state() plan: ApplyPlan | null = null;

  /** What was applied, shown on the last step. */
  @state() applied: ApplyPlan | null = null;

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('doc') && changed.get('doc') !== undefined) {
      this.reset();
    }
    if (changed.has('stencil') && this.application) {
      this.keepSelectionIn(this.stencil);
    }
  }

  /** Returns to the first step, forgetting the application and assignment. */
  reset(): void {
    this.step = 'choose';
    this.application = null;
    this.version = undefined;
    this.assignment = new Map();
    this.plan = null;
    this.applied = null;
  }

  /** Follows the selected application into a new stencil, or resets. */
  private keepSelectionIn(stencil: StencilData): void {
    const current = this.application;
    const app = stencil.applications.find(
      candidate =>
        candidate.category === current?.category &&
        candidate.name === current?.name
    );
    const version = app?.versions.find(
      candidate => candidate.version === this.version?.version
    );
    if (!app || !version) {
      this.reset();
      return;
    }
    this.application = app;
    this.version = version;
  }

  private choose(app: VersionedApplications): void {
    this.application = app;
    this.version = defaultVersion(app, this.showDeprecated);
    this.assignment = new Map();
  }

  private toggleDeprecated(): void {
    this.showDeprecated = !this.showDeprecated;
    if (
      this.application &&
      !visibleApplications(this.stencil, this.showDeprecated).includes(
        this.application
      )
    ) {
      this.reset();
    }
  }

  private assign(fn: string, iedName: string): void {
    const next = new Map(this.assignment);
    if (iedName) {
      next.set(fn, iedName);
    } else {
      next.delete(fn);
    }
    this.assignment = next;
  }

  private goToReview(): void {
    if (!this.doc || !this.version) {
      return;
    }
    this.plan = planApply(this.doc, this.version, this.assignment);
    this.step = 'review';
  }

  private apply(): void {
    if (!this.plan || !this.application || !this.version) {
      return;
    }

    const detail: StencilApplyDetail = {
      edits: this.plan.edits,
      title: `Apply stencil ${this.application.name} ${this.version.version}`,
      plan: this.plan
    };
    this.applied = this.plan;
    this.step = 'done';
    this.dispatchEvent(
      new CustomEvent<StencilApplyDetail>('stencil-apply', {
        detail,
        bubbles: true,
        composed: true
      })
    );
  }

  /** What applying did to each cell of the mapping table. */
  private appliedMarkers(): Map<string, CellMarker> {
    const functionOf = new Map(
      [...this.assignment].map(([fn, ied]) => [ied, fn])
    );
    const markers = new Map<string, CellMarker>();

    this.applied?.items.forEach((item) => {
      const from = functionOf.get(item.from);
      const to = functionOf.get(item.to);
      if (!from || !to) {
        return;
      }

      const failed = item.supervision === 'error' || item.quality === 'error';
      const added =
        item.subscriptions > 0 ||
        item.supervision === 'new' ||
        item.quality === 'new';
      markers.set(
        cellKey(from, to, item.controlBlock),
        failed
          ? { kind: 'error', label: msg('Not fully applied') }
          : added
            ? { kind: 'new', label: msg('Added') }
            : { kind: 'present', label: msg('Already present') }
      );
    });
    // control blocks of a function that was not given an IED were not applied
    this.version?.ControlBlocks.forEach((cb) => {
      if (!this.assignment.has(cb.from) || !this.assignment.has(cb.to)) {
        markers.set(cellKey(cb.from, cb.to, cb.name), {
          kind: 'skipped',
          label: msg('Not applied')
        });
      }
    });
    return markers;
  }

  private renderMappings(
    version: Application,
    extra: Partial<{
      assignment: ReadonlyMap<string, string>;
      markers: ReadonlyMap<string, CellMarker>;
    }> = {}
  ): TemplateResult {
    return html`<section class="card wide mappings" aria-labelledby="mappings-heading">
      <h2 id="mappings-heading">${msg('Mappings')}</h2>
      <oscd-stencil-mapping-table
        .controlBlocks=${version.ControlBlocks}
        .assignment=${extra.assignment ?? new Map()}
        .markers=${extra.markers ?? new Map()}
      ></oscd-stencil-mapping-table>
    </section>`;
  }

  private renderSteps(): TemplateResult {
    const current = steps.findIndex(step => step.id === this.step);

    return html`<ol class="steps" aria-label="${msg('Progress')}">
      ${steps.map(
        (step, i) => html`<li
          class="${i === current ? 'current' : i < current || this.step === 'done' ? 'complete' : ''}"
          aria-current="${i === current ? 'step' : 'false'}"
        >
          <span class="number"
            >${i < current || this.step === 'done'
              ? html`<oscd-icon>check</oscd-icon>`
              : i + 1}</span
          >
          ${step.label()}
        </li>`
      )}
    </ol>`;
  }

  private applicationItems(): SelectItem[] {
    return visibleApplications(this.stencil, this.showDeprecated)
      .sort(
        (a, b) =>
          a.category.toLowerCase().localeCompare(b.category.toLowerCase()) ||
          a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      )
      .map((app) => {
        const version = defaultVersion(app, this.showDeprecated);
        return {
          headline: app.name,
          supportingText: [app.category, app.description, version?.version]
            .filter(Boolean)
            .join(' · '),
          selected: app === this.application
        };
      });
  }

  private renderApplicationList(): TemplateResult {
    const apps = visibleApplications(this.stencil, this.showDeprecated).sort(
      (a, b) =>
        a.category.toLowerCase().localeCompare(b.category.toLowerCase()) ||
        a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );

    return html`<oscd-selection-list
      id="applications"
      filterable
      .items=${this.applicationItems()}
      @selection-list-change=${(event: Event) => {
        const list = event.target as OscdSelectionList;
        const index = list.items.findIndex(item => item.selected);
        if (index >= 0) {
          this.choose(apps[index]);
        } else {
          // clicking the chosen application clears the list's tick; keep the choice
          this.requestUpdate();
        }
      }}
    ></oscd-selection-list>`;
  }

  private renderVersionDetails(): TemplateResult {
    const app = this.application;
    const version = this.version;
    if (!app || !version) {
      return html`<p class="hint" id="choose-hint">
        ${app
          ? msg('This application has no version that can be used.')
          : msg('Choose an application to see what it needs.')}
      </p>`;
    }

    const versions = selectableVersions(app, this.showDeprecated);
    const summary = summarizeVersion(version);

    return html`<div class="card">
      <h2>${app.name}</h2>
      <p class="muted">${app.category}${app.description ? ` · ${app.description}` : ''}</p>

      ${versions.length > 1
        ? html`<oscd-outlined-select
            id="version"
            label="${msg('Version')}"
            @change=${(event: Event) => {
              this.version = versions.find(
                v => v.version === (event.target as OscdOutlinedSelect).value
              );
              this.assignment = new Map();
            }}
          >
            ${versions.map(
              v => html`<oscd-select-option
                value="${v.version}"
                ?selected=${v === version}
              >
                <div slot="headline">
                  ${v.version}${v.deprecated ? ` (${msg('deprecated')})` : ''}
                </div>
              </oscd-select-option>`
            )}
          </oscd-outlined-select>`
        : html`<p><strong>${msg('Version')}</strong> ${version.version}${version.deprecated ? ` (${msg('deprecated')})` : ''}</p>`}
      ${version.description ? html`<p>${version.description}</p>` : nothing}

      <p class="summary" id="summary">
        ${msg(str`${summary.functions} functions`)} ·
        ${msg(str`${summary.goose} GOOSE`)} · ${msg(str`${summary.smv} SV`)} ·
        ${msg(str`${summary.subscriptions} subscriptions`)} ·
        ${msg(str`${summary.supervisions} supervisions`)}
      </p>

      <h3>${msg('Needs')}</h3>
      <ul class="needs">
        ${functionNames(version).map(
          name => html`<li>
            <oscd-icon>developer_board</oscd-icon>
            <span><strong>${name}</strong> ${describeRequirement(version.IEDS[name])}</span>
          </li>`
        )}
      </ul>

      <div class="actions">
        <span class="spacer"></span>
        <oscd-filled-button id="next" @click=${() => (this.step = 'assign')}
          >${msg('Next')}<oscd-icon slot="icon">arrow_forward</oscd-icon></oscd-filled-button
        >
      </div>
    </div>`;
  }

  private renderChoose(): TemplateResult {
    if (this.stencil.applications.length === 0) {
      return html`<p class="hint" id="empty">
        ${msg('This stencil has no applications yet. Open a stencil file, or create an application from this document on the Create tab.')}
      </p>`;
    }

    return html`<div class="choose">
      <section aria-label="${msg('Applications')}">
        <label class="switch"
          ><oscd-switch
            id="show-deprecated"
            touch-target="wrapper"
            ?selected=${this.showDeprecated}
            @change=${() => this.toggleDeprecated()}
          ></oscd-switch
          >${msg('Show deprecated')}</label
        >
        ${this.renderApplicationList()}
      </section>
      <section aria-label="${msg('Details')}">${this.renderVersionDetails()}</section>
    </div>
    ${this.version ? this.renderMappings(this.version) : nothing}`;
  }

  private renderFunction(version: Application, name: string): TemplateResult {
    const doc = this.doc!;
    const requirement = version.IEDS[name];
    const chosen = this.assignment.get(name) ?? '';
    const takenByOthers = new Set(
      [...this.assignment].filter(([fn]) => fn !== name).map(([, ied]) => ied)
    );
    const candidates = candidateIeds(doc, requirement, takenByOthers);
    const reason = noCandidateReason(doc, requirement, takenByOthers);

    return html`<li class="function" data-function="${name}">
      <div class="who">
        <oscd-icon>developer_board</oscd-icon>
        <div>
          <strong>${name}</strong>
          <div class="muted">${describeRequirement(requirement)}</div>
        </div>
      </div>
      ${reason !== null
        ? html`<p class="reason" role="note"><oscd-icon>info</oscd-icon>${reason}</p>`
        : html`<oscd-outlined-select
            label="${msg('IED')}"
            @change=${(event: Event) =>
              this.assign(name, (event.target as OscdOutlinedSelect).value)}
          >
            <oscd-select-option value="" ?selected=${chosen === ''}>
              <div slot="headline">${msg('Not assigned')}</div>
            </oscd-select-option>
            ${candidates.map((ied) => {
              const iedName = ied.getAttribute('name')!;
              return html`<oscd-select-option
                value="${iedName}"
                ?selected=${chosen === iedName}
              >
                <div slot="headline">${iedName}</div>
                <div slot="supporting-text">${getIedDescription(ied).secondLine}</div>
              </oscd-select-option>`;
            })}
          </oscd-outlined-select>`}
    </li>`;
  }

  private renderAssign(): TemplateResult {
    const version = this.version!;
    const assigned = this.assignment.size;

    return html`<div class="card wide">
      <h2>${msg('Assign an IED to each function')}</h2>
      <ul class="functions">
        ${functionNames(version).map(name => this.renderFunction(version, name))}
      </ul>
      <p class="muted" id="assigned">
        ${msg(str`${assigned} of ${Object.keys(version.IEDS).length} functions assigned`)}
      </p>
      <div class="actions">
        <oscd-text-button id="back" @click=${() => (this.step = 'choose')}
          >${msg('Back')}</oscd-text-button
        >
        <span class="spacer"></span>
        <oscd-outlined-button
          id="clear"
          ?disabled=${assigned === 0}
          @click=${() => (this.assignment = new Map())}
          >${msg('Clear')}</oscd-outlined-button
        >
        <oscd-outlined-button
          id="auto"
          @click=${() => (this.assignment = autoAssign(this.doc!, version, this.assignment))}
          ><oscd-icon slot="icon">auto_fix_high</oscd-icon>${msg('Assign automatically')}</oscd-outlined-button
        >
        <oscd-filled-button
          id="next"
          ?disabled=${assigned < 2}
          @click=${() => this.goToReview()}
          >${msg('Next')}<oscd-icon slot="icon">arrow_forward</oscd-icon></oscd-filled-button
        >
      </div>
    </div>`;
  }

  private renderStatus(status: PartStatus, count?: number): TemplateResult {
    const label = statusText[status]();
    return html`<span class="status ${status}"
      >${status === 'present' ? html`<oscd-icon>check</oscd-icon>` : nothing}${count !== undefined
        ? `${count} `
        : ''}${label}</span
    >`;
  }

  private renderReview(): TemplateResult {
    const plan = this.plan!;
    const nothingToDo = plan.edits.length === 0;

    return html`<div class="card wide">
      <h2>${msg('Review')}</h2>
      <p class="summary" id="plan-summary">
        ${msg(str`${plan.subscriptions} new subscriptions`)} ·
        ${msg(str`${plan.supervisions} new supervisions`)} ·
        ${msg(str`${plan.qualityLinks} SEL quality links`)} ·
        ${msg(str`${plan.present} already present`)}
      </p>

      <table id="plan">
        <caption>${msg('What will change')}</caption>
        <thead>
          <tr>
            <th scope="col">${msg('From')}</th>
            <th scope="col">${msg('To')}</th>
            <th scope="col">${msg('Control block')}</th>
            <th scope="col">${msg('Subscriptions')}</th>
            <th scope="col">${msg('Supervision')}</th>
            <th scope="col">${msg('SEL quality')}</th>
          </tr>
        </thead>
        <tbody>
          ${plan.items.map(
            item => html`<tr>
              <th scope="row">${item.from}</th>
              <td>${item.to}</td>
              <td>
                <oscd-icon
                  class="${item.type === 'GSEControl' ? 'goose' : 'smv'}"
                  title="${item.type === 'GSEControl' ? 'GOOSE' : 'SV'}"
                  >${item.type === 'GSEControl' ? 'gooseIcon' : 'smvIcon'}</oscd-icon
                >
                ${item.controlBlock}
              </td>
              <td>
                ${item.subscriptions > 0 ? this.renderStatus('new', item.subscriptions) : nothing}
                ${item.present > 0 ? this.renderStatus('present', item.present) : nothing}
                ${item.subscriptions + item.present === 0 ? this.renderStatus('none') : nothing}
              </td>
              <td>${this.renderStatus(item.supervision)}</td>
              <td>${this.renderStatus(item.quality)}</td>
            </tr>`
          )}
        </tbody>
      </table>

      ${plan.errors.length > 0
        ? html`<div class="problems" role="alert" id="problems">
            <strong>${msg('These could not be found and will be skipped:')}</strong>
            <ul>${plan.errors.map(error => html`<li>${error}</li>`)}</ul>
          </div>`
        : nothing}
      ${nothingToDo && plan.errors.length === 0
        ? html`<p class="hint" id="nothing">${msg('Everything is already in place. There is nothing to apply.')}</p>`
        : nothing}

      <div class="actions">
        <oscd-text-button id="back" @click=${() => (this.step = 'assign')}
          >${msg('Back')}</oscd-text-button
        >
        <span class="spacer"></span>
        <oscd-filled-button
          id="apply"
          ?disabled=${nothingToDo}
          @click=${() => this.apply()}
          >${msg('Apply')}<oscd-icon slot="icon">draw_collage</oscd-icon></oscd-filled-button
        >
      </div>
    </div>`;
  }

  private renderDone(): TemplateResult {
    const plan = this.applied!;

    return html`<div class="card wide" id="done" role="status">
      <h2>${msg('Applied')}</h2>
      <p>
        ${msg(
          str`${plan.subscriptions} subscriptions, ${plan.supervisions} supervisions and ${plan.qualityLinks} SEL quality links were added.`
        )}
      </p>
      <p class="muted">${msg('This is one change. Use undo in the menu bar to revert it.')}</p>
      ${plan.errors.length > 0
        ? html`<p class="reason" role="note"><oscd-icon>info</oscd-icon>${msg(str`${plan.errors.length} items could not be found and were skipped.`)}</p>`
        : nothing}
      <div class="actions">
        <span class="spacer"></span>
        <oscd-filled-button id="another" @click=${() => this.reset()}
          >${msg('Apply another')}</oscd-filled-button
        >
      </div>
    </div>
    ${this.version
      ? this.renderMappings(this.version, {
        assignment: this.assignment,
        markers: this.appliedMarkers()
      })
      : nothing}`;
  }

  render(): TemplateResult {
    if (!this.doc) {
      return html`<p class="hint">${msg('Please open a file to apply a stencil.')}</p>`;
    }

    return html`${this.renderSteps()}
    ${this.step === 'choose' ? this.renderChoose() : nothing}
    ${this.step === 'assign' && this.version ? this.renderAssign() : nothing}
    ${this.step === 'review' && this.plan ? this.renderReview() : nothing}
    ${this.step === 'done' && this.applied ? this.renderDone() : nothing}`;
  }

  static styles = [
    ...themeStyles,
    css`
      :host {
        display: block;
        color: var(--oscd-base00);
        padding: 12px;
      }

      h2,
      h3 {
        font-weight: 400;
        margin: 0 0 8px;
      }

      p {
        margin: 8px 0;
      }

      .muted {
        color: var(--oscd-base0);
      }

      .hint {
        color: var(--oscd-base0);
        padding: 24px 8px;
      }

      .steps {
        display: flex;
        gap: 24px;
        list-style: none;
        margin: 0 0 16px;
        padding: 0;
      }

      .steps li {
        align-items: center;
        color: var(--oscd-base0);
        display: flex;
        gap: 8px;
      }

      .steps li.current {
        color: var(--oscd-primary);
        font-weight: 500;
      }

      .steps li.complete {
        color: var(--oscd-base00);
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

      .choose {
        display: grid;
        gap: 24px;
        grid-template-columns: minmax(280px, 1fr) minmax(320px, 1.4fr);
      }

      .switch {
        align-items: center;
        display: flex;
        margin-bottom: 8px;
      }

      oscd-selection-list {
        max-height: 60vh;
        overflow-y: auto;
      }

      .card {
        background: var(--oscd-base2);
        border-radius: var(--md-sys-shape-corner-medium);
        padding: 16px 20px;
      }

      .card.wide {
        max-width: 960px;
      }

      .mappings {
        margin-top: 16px;
        max-width: none;
      }

      .needs,
      .functions {
        list-style: none;
        margin: 8px 0;
        padding: 0;
      }

      .needs li {
        align-items: center;
        display: flex;
        gap: 8px;
        padding: 4px 0;
      }

      .function {
        align-items: center;
        display: grid;
        gap: 16px;
        grid-template-columns: minmax(200px, 1fr) minmax(240px, 1fr);
        padding: 8px 0;
      }

      .who {
        align-items: center;
        display: flex;
        gap: 12px;
      }

      .reason {
        align-items: center;
        display: flex;
        gap: 8px;
        margin: 0;
      }

      .actions {
        align-items: center;
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        margin-top: 16px;
      }

      .spacer {
        flex: 1;
      }

      .danger {
        --md-text-button-label-text-color: var(--oscd-error);
        margin-right: auto;
      }

      table {
        border-collapse: collapse;
        margin: 12px 0;
        width: 100%;
      }

      caption {
        caption-side: top;
        font-weight: 500;
        padding-bottom: 8px;
        text-align: left;
      }

      th,
      td {
        border-bottom: 1px solid var(--oscd-base1);
        padding: 6px 8px;
        text-align: left;
      }

      .status {
        align-items: center;
        display: inline-flex;
        gap: 4px;
        margin-right: 8px;
      }

      .status.new {
        color: var(--oscd-primary);
        font-weight: 500;
      }

      .status.error {
        color: var(--oscd-error);
      }

      .status.none {
        color: var(--oscd-base0);
      }

      oscd-icon.goose {
        color: var(--stencil-goose-color);
      }

      oscd-icon.smv {
        color: var(--stencil-sv-color);
      }

      .problems {
        border-left: 4px solid var(--oscd-error);
        margin: 12px 0;
        padding: 4px 12px;
      }
    `
  ];
}
