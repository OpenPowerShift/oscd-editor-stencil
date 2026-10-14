import { css, html, LitElement, nothing } from 'lit';
import type { PropertyValues, TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { ifDefined } from 'lit/directives/if-defined.js';
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
  requiredTags,
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
import { OscdStencilHelp } from '../shared/help.js';
import {
  helpAssign,
  helpReview,
  helpWhatIsAStencil
} from '../shared/help-content.js';
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
    'oscd-stencil-help': OscdStencilHelp,
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

  /** Changes whenever the document is edited, so a reviewed plan can be checked again. */
  @property({ attribute: false }) docVersion?: unknown;

  /** Whether the table of control blocks is shown under the chosen application. */
  @state() showMappings = false;

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
    // what was reviewed must still be what will be applied
    if (
      this.step === 'review' &&
      this.version &&
      (changed.has('docVersion') || changed.has('stencil') || changed.has('doc'))
    ) {
      this.plan = this.doc
        ? planApply(this.doc, this.version, this.assignment)
        : null;
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

  /** Assigns every function that has exactly one candidate. */
  private autoAssignFunctions(): void {
    this.assignment = autoAssign(this.doc!, this.version!, this.assignment);
  }

  /** Whether assigning automatically would assign anything more. */
  private get canAutoAssign(): boolean {
    return (
      !!this.doc &&
      !!this.version &&
      autoAssign(this.doc, this.version, this.assignment).size >
        this.assignment.size
    );
  }

  /** The unassigned functions that more than one IED fits. */
  private ambiguousFunctions(): string[] {
    const version = this.version;
    if (!version || !this.doc) {
      return [];
    }
    const taken = new Set(this.assignment.values());
    return functionNames(version).filter(
      name =>
        !this.assignment.has(name) &&
        candidateIeds(this.doc!, version.IEDS[name], taken).length > 1
    );
  }

  private apply(): void {
    if (!this.plan || !this.application || !this.version || !this.doc) {
      return;
    }

    // the document may have changed since the review: plan again, and only
    // apply what was shown
    const fresh = planApply(this.doc, this.version, this.assignment);
    if (
      fresh.edits.length !== this.plan.edits.length ||
      fresh.subscriptions !== this.plan.subscriptions ||
      fresh.supervisions !== this.plan.supervisions
    ) {
      this.plan = fresh;
      return;
    }

    const detail: StencilApplyDetail = {
      edits: fresh.edits,
      title: `Apply stencil ${this.application.name} ${this.version.version}`,
      plan: fresh
    };
    this.applied = fresh;
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

    const deprecated = version.deprecated
      ? html`<span class="badge deprecated">${msg('deprecated')}</span>`
      : nothing;

    return html`<div class="card details">
      <header class="title-row">
        <div class="title">
          <h2>${app.name}</h2>
          <p class="category">${app.category}</p>
          ${app.description ? html`<p class="description">${app.description}</p>` : nothing}
        </div>
        <div class="version-box">
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
            : html`<p class="version-line" id="version-line">
                <span class="badge version" title="${msg('Version')}"
                  >${msg('Version')} <strong>${version.version}</strong></span
                >${deprecated}
              </p>`}
          ${version.description
            ? html`<p class="version-description">${version.description}</p>`
            : nothing}
        </div>
      </header>

      <ul class="stats" id="summary" aria-label="${msg('Contents')}">
        <li>${msg(str`${summary.functions} IEDs`)}</li>
        <li>${msg(str`${summary.goose} GOOSE`)}</li>
        <li>${msg(str`${summary.smv} SV`)}</li>
        <li>${msg(str`${summary.subscriptions} subscriptions`)}</li>
        <li>${msg(str`${summary.supervisions} supervisions`)}</li>
      </ul>

      <h3>${msg('Needs')}</h3>
      <ul class="needs">
        ${functionNames(version).map((name) => {
          const requirement = version.IEDS[name];
          return html`<li>
            <oscd-icon aria-hidden="true">developer_board</oscd-icon>
            <strong class="fn">${name}</strong>
            <span class="kind">${requirement.manufacturer} ${requirement.type}</span>
            <span class="tags">
              ${requiredTags(requirement).map(
                tag => html`<span class="badge tag" title="${msg('Stencil tag')}"
                  ><oscd-icon aria-hidden="true">sell</oscd-icon
                  ><span class="id">${tag.id}</span
                  ><span class="ver">${tag.version}</span></span
                >`
              )}
            </span>
          </li>`;
        })}
      </ul>

      <div class="actions">
        <oscd-text-button
          id="show-mappings"
          aria-expanded=${this.showMappings ? 'true' : 'false'}
          @click=${() => (this.showMappings = !this.showMappings)}
          ><oscd-icon slot="icon" aria-hidden="true"
            >${this.showMappings ? 'expand_less' : 'expand_more'}</oscd-icon
          >${this.showMappings ? msg('Hide mappings') : msg('Show mappings')}</oscd-text-button
        >
        <span class="spacer"></span>
        <oscd-filled-button id="next" @click=${() => (this.step = 'assign')}
          >${msg('Next')}<oscd-icon slot="icon" aria-hidden="true">arrow_forward</oscd-icon></oscd-filled-button
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
        ${this.stencil.applications.some(app => app.versions.some(v => v.deprecated))
          ? html`<label class="switch"
              ><oscd-switch
                id="show-deprecated"
                touch-target="wrapper"
                ?selected=${this.showDeprecated}
                @change=${() => this.toggleDeprecated()}
              ></oscd-switch
              >${msg('Show deprecated')}</label
            >`
          : nothing}
        ${this.renderApplicationList()}
      </section>
      <section aria-label="${msg('Details')}">${this.renderVersionDetails()}</section>
    </div>
    ${this.version && this.showMappings ? this.renderMappings(this.version) : nothing}`;
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
        <oscd-icon aria-hidden="true">developer_board</oscd-icon>
        <div>
          <strong>${name}</strong>
          <div class="muted">${describeRequirement(requirement)}</div>
        </div>
      </div>
      ${reason !== null
        ? html`<p class="reason" role="note"><oscd-icon aria-hidden="true">info</oscd-icon>${reason}</p>`
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
      <h2 class="with-help">
        ${msg('Assign an IED to each function')}
        <oscd-stencil-help heading=${msg('Assigning IEDs')}>${helpAssign()}</oscd-stencil-help>
      </h2>
      <ul class="functions">
        ${functionNames(version).map(name => this.renderFunction(version, name))}
      </ul>
      <p class="muted" id="assigned">
        ${msg(str`${assigned} of ${Object.keys(version.IEDS).length} IEDs assigned`)}${assigned < 2
          ? html` · <span id="needs-two">${msg('Assign at least two IEDs to continue.')}</span>`
          : nothing}
      </p>
      ${this.ambiguousFunctions().length > 0
        ? html`<p class="reason" id="auto-note"><oscd-icon aria-hidden="true">info</oscd-icon>${msg(
          str`More than one IED fits ${this.ambiguousFunctions().join(', ')}. Choose those yourself.`
        )}</p>`
        : nothing}
      <div class="actions">
        <oscd-text-button id="back" @click=${() => (this.step = 'choose')}
          >${msg('Back')}</oscd-text-button
        >
        <span class="spacer"></span>
        <oscd-outlined-button
          id="clear"
          ?disabled=${assigned === 0}
          @click=${() => {
            this.assignment = new Map();
          }}
          >${msg('Clear')}</oscd-outlined-button
        >
        <oscd-outlined-button
          id="auto"
          ?disabled=${!this.canAutoAssign}
          @click=${() => this.autoAssignFunctions()}
          ><oscd-icon slot="icon" aria-hidden="true">auto_fix_high</oscd-icon>${msg('Assign automatically')}</oscd-outlined-button
        >
        <oscd-filled-button
          id="next"
          ?disabled=${assigned < 2}
          @click=${() => this.goToReview()}
          >${msg('Next')}<oscd-icon slot="icon" aria-hidden="true">arrow_forward</oscd-icon></oscd-filled-button
        >
      </div>
    </div>`;
  }

  private unassigned(): string[] {
    return this.version
      ? functionNames(this.version).filter(name => !this.assignment.has(name))
      : [];
  }

  private renderStatus(status: PartStatus, count?: number): TemplateResult {
    const label = statusText[status]();
    return html`<span class="status ${status}"
      >${status === 'present' ? html`<oscd-icon aria-hidden="true">check</oscd-icon>` : nothing}${count !== undefined
        ? `${count} `
        : ''}${label}</span
    >`;
  }

  private renderReview(): TemplateResult {
    const plan = this.plan!;
    const nothingToDo = plan.edits.length === 0;

    return html`<div class="card wide">
      <h2 class="with-help">
        ${msg('Review')}
        <oscd-stencil-help heading=${msg('Reviewing before applying')}>${helpReview()}</oscd-stencil-help>
      </h2>
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

      ${this.unassigned().length > 0
        ? html`<p class="reason" id="unassigned" role="note"><oscd-icon aria-hidden="true">info</oscd-icon>${msg(
          str`These functions have no IED, so their control blocks are not applied: ${this.unassigned().join(', ')}.`
        )}</p>`
        : nothing}
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
          >${msg('Apply')}<oscd-icon slot="icon" aria-hidden="true">draw_collage</oscd-icon></oscd-filled-button
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
        ? html`<p class="reason" role="note"><oscd-icon aria-hidden="true">info</oscd-icon>${msg(str`${plan.errors.length} items could not be found and were skipped.`)}</p>`
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

    return html`<div class="steps-row">
      ${this.renderSteps()}
      <oscd-stencil-help heading=${msg('What is a stencil?')}>${helpWhatIsAStencil()}</oscd-stencil-help>
    </div>
    ${this.step === 'choose' ? this.renderChoose() : nothing}
    ${this.step === 'assign' && this.version ? this.renderAssign() : nothing}
    ${this.step === 'review' && this.plan ? this.renderReview() : nothing}
    ${this.step === 'done' && this.applied ? this.renderDone() : nothing}`;
  }

  static styles = [
    ...themeStyles,
    css`
      :host {
        container-type: inline-size;
        display: block;
        color: var(--stencil-text);
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
        color: var(--stencil-text);
      }

      .hint {
        color: var(--stencil-text);
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

      .choose {
        display: grid;
        gap: 24px;
        grid-template-columns: minmax(280px, 1fr) minmax(320px, 1.4fr);
      }

      @container (max-width: 760px) {
        .choose {
          grid-template-columns: minmax(0, 1fr);
        }
      }

      .switch {
        align-items: center;
        display: flex;
        gap: 12px;
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
        overflow-x: auto;
        max-width: 960px;
      }

      .card.wide.mappings {
        margin-top: 16px;
        max-width: none;
        overflow: visible;
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

      .who strong,
      .needs .fn {
        font-weight: 500;
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
        flex-wrap: wrap;
        gap: 8px;
        justify-content: flex-end;
        margin-top: 16px;
      }

      .spacer {
        flex: 1;
      }

      .danger {
        --md-text-button-label-text-color: var(--stencil-danger);
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
        border-bottom: 1px solid var(--stencil-border);
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
        color: var(--oscd-base03);
        font-weight: 600;
      }

      .status.error {
        color: var(--stencil-danger);
      }

      .status.none {
        color: var(--stencil-text);
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

      @container (max-width: 640px) {
        .function {
          grid-template-columns: minmax(0, 1fr);
        }
      }

      .with-help {
        align-items: center;
        display: flex;
        gap: 4px;
      }

      .steps-row {
        align-items: flex-start;
        display: flex;
        gap: 12px;
        justify-content: space-between;
      }

      .details .title-row {
        align-items: flex-start;
        display: grid;
        gap: 4px 24px;
        grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
      }

      .details h2 {
        margin: 0;
      }

      .details p {
        margin: 4px 0 0;
      }

      .category {
        font-size: 0.875rem;
        font-weight: 500;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }

      .version-box {
        align-items: flex-end;
        display: flex;
        flex-direction: column;
        gap: 4px;
        text-align: right;
      }

      .version-line {
        align-items: center;
        display: flex;
        gap: 6px;
        justify-content: flex-end;
      }

      .version-description {
        font-style: italic;
      }

      .badge {
        align-items: center;
        background: var(--oscd-base3);
        border: 1px solid var(--stencil-border);
        border-radius: 999px;
        display: inline-flex;
        font-size: 0.8125rem;
        gap: 6px;
        line-height: 1.4;
        padding: 1px 10px;
        white-space: nowrap;
      }

      .badge.deprecated {
        border-color: var(--stencil-danger);
        color: var(--stencil-danger);
      }

      .badge.tag oscd-icon {
        --md-icon-size: 16px;
        margin-left: -4px;
      }

      .badge.tag .ver {
        border-left: 1px solid var(--stencil-border);
        padding-left: 6px;
      }

      .stats {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 8px;
        list-style: none;
        margin: 12px 0 4px;
        padding: 0;
      }

      .stats li {
        background: var(--oscd-base3);
        border-radius: 999px;
        font-size: 0.875rem;
        padding: 2px 12px;
      }

      .details h3 {
        margin: 16px 0 4px;
      }

      .details .needs {
        margin: 4px 0 0;
        padding-left: 16px;
      }

      .details .needs li {
        align-items: center;
        border-top: 1px solid var(--stencil-border);
        display: grid;
        gap: 4px 12px;
        grid-template-columns: auto minmax(6rem, max-content) minmax(0, 1fr) auto;
        padding: 8px 0;
      }

      .details .needs li:first-child {
        border-top: none;
      }

      .needs .tags {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        justify-content: flex-end;
      }

      @container (max-width: 640px) {
        .details .title-row {
          grid-template-columns: minmax(0, 1fr);
        }

        .version-box {
          align-items: flex-start;
          text-align: left;
        }

        .version-line {
          justify-content: flex-start;
        }

        .details .needs li {
          grid-template-columns: auto minmax(0, 1fr);
        }

        .needs .kind,
        .needs .tags {
          grid-column: 2;
          justify-content: flex-start;
        }
      }
    `
  ];
}
