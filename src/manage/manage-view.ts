import { css, html, LitElement, nothing } from 'lit';
import type { PropertyValues, TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { msg, str, updateWhenLocaleChanges } from '@lit/localize';
import { ScopedElementsMixin } from '@open-wc/scoped-elements/lit-element.js';

import { OscdDialog } from '@omicronenergy/oscd-ui/dialog/OscdDialog.js';
import { OscdFilledButton } from '@omicronenergy/oscd-ui/button/OscdFilledButton.js';
import { OscdIcon } from '@omicronenergy/oscd-ui/icon/OscdIcon.js';
import { OscdOutlinedButton } from '@omicronenergy/oscd-ui/button/OscdOutlinedButton.js';
import { OscdOutlinedSelect } from '@omicronenergy/oscd-ui/select/OscdOutlinedSelect.js';
import { OscdOutlinedTextField } from '@omicronenergy/oscd-ui/textfield/OscdOutlinedTextField.js';
import { OscdSelectOption } from '@omicronenergy/oscd-ui/select/OscdSelectOption.js';
import { OscdSwitch } from '@omicronenergy/oscd-ui/switch/OscdSwitch.js';
import { OscdTextButton } from '@omicronenergy/oscd-ui/button/OscdTextButton.js';
import { OscdTree } from '@omicronenergy/oscd-ui/tree/OscdTree.js';
import { OscdTreeItem } from '@omicronenergy/oscd-ui/tree/OscdTreeItem.js';
import type { TreeNode } from '@omicronenergy/oscd-ui/tree/OscdTree.js';

import type { LibraryEntry } from '../foundation/library.js';
import {
  applicationProblem,
  compareVersions,
  functionProblem,
  removeApplication,
  removeApplicationVersion,
  renameFunction,
  replaceVersion,
  summarizeVersion,
  updateApplication,
  updateRequirement,
  updateVersion,
  versionProblem
} from '../foundation/stencil-model.js';
import type { ApplicationKey } from '../foundation/stencil-model.js';
import type {
  Application,
  StencilData,
  VersionedApplications
} from '../foundation/types.js';
import { OscdStencilMappingTable } from '../shared/mapping-table.js';
import { problemText } from '../shared/problem-text.js';
import { themeStyles } from '../theme.js';

/** What is selected in the tree. A version is selected with its application. */
export type Selection = ApplicationKey & { version?: string };

type Node = TreeNode & { label: string; icon: string; children: Node[] };

const SEPARATOR = '\u0001';

/** The tree id of an application, or of a version of it. */
export const nodeId = (selection: Selection): string =>
  [selection.category, selection.name, selection.version]
    .filter(part => part !== undefined)
    .join(SEPARATOR);

type Confirming = 'version' | 'application' | 'stencil' | null;

/**
 * Manages the stencils: pick one from the library, import and export it,
 * and rename, describe, deprecate and delete the applications and versions
 * in it. Each valid edit raises `stencil-change` with the whole new stencil;
 * nothing is changed here.
 *
 * Other events: `stencil-select` (library id), `stencil-import`,
 * `stencil-export`, `stencil-remove` (library id) and `stencil-tag`.
 */
export class OscdStencilManage extends ScopedElementsMixin(LitElement) {
  static scopedElements = {
    'oscd-dialog': OscdDialog,
    'oscd-filled-button': OscdFilledButton,
    'oscd-icon': OscdIcon,
    'oscd-outlined-button': OscdOutlinedButton,
    'oscd-outlined-select': OscdOutlinedSelect,
    'oscd-outlined-text-field': OscdOutlinedTextField,
    'oscd-select-option': OscdSelectOption,
    'oscd-stencil-mapping-table': OscdStencilMappingTable,
    'oscd-switch': OscdSwitch,
    'oscd-text-button': OscdTextButton,
    'oscd-tree': OscdTree,
    'oscd-tree-item': OscdTreeItem
  };

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  @property({ attribute: false }) stencil!: StencilData;

  /** The stencils that have been imported, the most recently used first. */
  @property({ attribute: false }) library: readonly LibraryEntry[] = [];

  @property() currentId = '';

  @state() selection: Selection | null = null;

  @state() confirming: Confirming = null;

  /** The problem with the last value entered in each field. */
  @state() problems: Record<string, string> = {};

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('stencil') && this.selection) {
      const { category, name, version } = this.selection;
      const app = this.stencil.applications.find(
        a => a.category === category && a.name === name
      );
      if (!app || (version && !app.versions.some(v => v.version === version))) {
        this.selection = null;
      }
    }
    if (changed.has('currentId')) {
      this.selection = null;
      this.problems = {};
    }
  }

  private get application(): VersionedApplications | undefined {
    const selection = this.selection;
    return this.stencil.applications.find(
      a => a.category === selection?.category && a.name === selection?.name
    );
  }

  private get version(): Application | undefined {
    return this.application?.versions.find(
      v => v.version === this.selection?.version
    );
  }

  private emit<T>(type: string, detail?: T): void {
    this.dispatchEvent(
      new CustomEvent(type, { detail, bubbles: true, composed: true })
    );
  }

  private change(stencil: StencilData): void {
    this.emit('stencil-change', stencil);
  }

  private setProblem(field: string, problem: string | null): boolean {
    const { [field]: _, ...rest } = this.problems;
    this.problems = problem ? { ...rest, [field]: problem } : rest;
    return problem === null;
  }

  private tree(): Node[] {
    const categories = new Map<string, VersionedApplications[]>();
    [...this.stencil.applications]
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(app =>
        categories.set(app.category, [...(categories.get(app.category) ?? []), app])
      );

    return [...categories]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, apps]) => ({
        id: category,
        label: category,
        icon: 'folder',
        children: apps.map(app => ({
          id: nodeId(app),
          label: app.name,
          icon: 'deployed_code',
          children: [...app.versions]
            .sort((a, b) => compareVersions(b.version, a.version))
            .map(v => ({
              id: nodeId({ ...app, version: v.version }),
              label: v.deprecated
                ? `${v.version} (${msg('deprecated')})`
                : v.version,
              icon: '',
              children: []
            }))
        }))
      }));
  }

  private select(id: string | undefined): void {
    const [category, name, version] = (id ?? '').split(SEPARATOR);
    this.selection = name ? { category, name, version } : null;
    this.problems = {};
  }

  private renderLibrary(): TemplateResult {
    return html`<div class="card" id="library">
      <div class="row">
        <oscd-outlined-select
          id="stencils"
          label=${msg('Stencil')}
          .value=${this.currentId}
          @change=${(e: Event) =>
            this.emit('stencil-select', (e.target as OscdOutlinedSelect).value)}
        >
          ${this.library.map(
            entry =>
              html`<oscd-select-option
                value=${entry.id}
                ?selected=${entry.id === this.currentId}
                ><div slot="headline">
                  ${entry.stencil.name} ${entry.stencil.version}
                </div></oscd-select-option
              >`
          )}
        </oscd-outlined-select>
        <oscd-outlined-button id="import" @click=${() => this.emit('stencil-import')}
          >${msg('Import')}<oscd-icon slot="icon">file_open</oscd-icon></oscd-outlined-button
        >
        <oscd-outlined-button id="export" @click=${() => this.emit('stencil-export')}
          >${msg('Export')}<oscd-icon slot="icon">download</oscd-icon></oscd-outlined-button
        >
        <oscd-text-button
          id="remove-stencil"
          class="danger"
          ?disabled=${!this.currentId}
          @click=${() => (this.confirming = 'stencil')}
          >${msg('Remove from library')}</oscd-text-button
        >
      </div>
      <div class="row">
        <oscd-outlined-text-field
          id="stencil-name"
          label=${msg('Name')}
          .value=${this.stencil.name}
          .error=${!!this.problems['stencil-name']}
          .errorText=${this.problems['stencil-name'] ?? ''}
          @change=${(e: Event) => {
            const value = (e.target as OscdOutlinedTextField).value.trim();
            if (this.setProblem('stencil-name', value ? null : msg('A name is needed'))) {
              this.change({ ...this.stencil, name: value });
            }
          }}
        ></oscd-outlined-text-field>
        <oscd-outlined-text-field
          id="stencil-version"
          label=${msg('Version')}
          .value=${this.stencil.version}
          .error=${!!this.problems['stencil-version']}
          .errorText=${this.problems['stencil-version'] ?? ''}
          @change=${(e: Event) => {
            const value = (e.target as OscdOutlinedTextField).value.trim();
            if (this.setProblem('stencil-version', value ? null : msg('A version is needed'))) {
              this.change({ ...this.stencil, version: value });
            }
          }}
        ></oscd-outlined-text-field>
      </div>
    </div>`;
  }

  private textField(
    id: string,
    label: string,
    value: string,
    commit: (value: string) => string | null,
    type: 'text' | 'textarea' = 'text'
  ): TemplateResult {
    return html`<oscd-outlined-text-field
      id=${id}
      type=${type}
      label=${label}
      .value=${value}
      .error=${!!this.problems[id]}
      .errorText=${this.problems[id] ?? ''}
      @change=${(e: Event) => {
        const problem = commit((e.target as OscdOutlinedTextField).value);
        this.setProblem(id, problem ? problemText(problem) : null);
      }}
    ></oscd-outlined-text-field>`;
  }

  private renderApplication(app: VersionedApplications): TemplateResult {
    const key: ApplicationKey = { category: app.category, name: app.name };
    const edit = (next: Partial<VersionedApplications>) => {
      const info = { ...app, ...next };
      const problem = applicationProblem(this.stencil, key, info);
      if (!problem) {
        this.change(updateApplication(this.stencil, key, info));
        this.selection = {
          category: info.category.trim(),
          name: info.name.trim(),
          version: this.selection?.version
        };
      }
      return problem;
    };

    return html`<div class="card" id="application">
      <h2>${msg('Application')}</h2>
      <div class="fields">
        ${this.textField('app-category', msg('Category'), app.category, v => edit({ category: v }))}
        ${this.textField('app-name', msg('Name'), app.name, v => edit({ name: v }))}
        ${this.textField('app-description', msg('Description'), app.description, v => edit({ description: v }), 'textarea')}
      </div>
      ${this.selection?.version
        ? nothing
        : html`<div class="actions">
            <oscd-text-button
              id="delete-application"
              class="danger"
              @click=${() => (this.confirming = 'application')}
              >${msg('Delete application')}</oscd-text-button
            >
          </div>`}
    </div>`;
  }

  private renderVersion(app: VersionedApplications, version: Application): TemplateResult {
    const key: ApplicationKey = { category: app.category, name: app.name };
    const summary = summarizeVersion(version);
    const editVersion = (next: Partial<Application>) => {
      const info = { ...version, ...next };
      const problem = versionProblem(this.stencil, key, version.version, info.version);
      if (!problem) {
        this.change(updateVersion(this.stencil, key, version.version, info));
        this.selection = { ...key, version: info.version.trim() };
      }
      return problem;
    };
    const editVersionBody = (next: Application) =>
      this.change(replaceVersion(this.stencil, key, version.version, next));

    return html`<div class="card" id="version">
      <h2>${msg(str`Version ${version.version}`)}</h2>
      <div class="fields">
        ${this.textField('ver-version', msg('Version'), version.version, v => editVersion({ version: v }))}
        ${this.textField('ver-description', msg('Description'), version.description, v => editVersion({ description: v }), 'textarea')}
        <label class="switch"
          ><oscd-switch
            id="deprecated"
            ?selected=${version.deprecated}
            @change=${(e: Event) =>
              editVersion({ deprecated: (e.target as OscdSwitch).selected })}
          ></oscd-switch
          >${msg('Deprecated, hidden when applying')}</label
        >
      </div>
      <p class="muted">
        ${msg(
          str`${summary.functions} functions, ${summary.goose} GOOSE, ${summary.smv} SV, ${summary.supervisions} supervisions`
        )}
      </p>

      <h3>${msg('Functions and what they require')}</h3>
      <div id="functions">
        ${Object.entries(version.IEDS).map(([fn, ied]) => {
          const tag = ied.privates[0];
          const requirement = (
            field: 'manufacturer' | 'type' | 'id' | 'idVersion'
          ) => (value: string) => {
            editVersionBody(
              updateRequirement(version, fn, {
                manufacturer: ied.manufacturer,
                type: ied.type,
                id: tag?.['OpenSCD-Stencil-Id'] ?? '',
                idVersion: tag?.['OpenSCD-Stencil-Version'] ?? '',
                [field]: value
              })
            );
            return null;
          };
          return html`<div class="function">
            ${this.textField(`fn-${fn}`, msg('Function'), fn, (value) => {
              const problem = functionProblem(version, fn, value);
              if (!problem) {
                editVersionBody(renameFunction(version, fn, value));
              }
              return problem;
            })}
            <div class="requirement">
              ${this.textField(`fn-${fn}-manufacturer`, msg('Manufacturer'), ied.manufacturer, requirement('manufacturer'))}
              ${this.textField(`fn-${fn}-type`, msg('Type'), ied.type, requirement('type'))}
              ${this.textField(`fn-${fn}-id`, msg('Stencil Id'), tag?.['OpenSCD-Stencil-Id'] ?? '', requirement('id'))}
              ${this.textField(`fn-${fn}-idversion`, msg('Stencil version'), tag?.['OpenSCD-Stencil-Version'] ?? '', requirement('idVersion'))}
            </div>
          </div>`;
        })}
      </div>

      <div class="actions">
        <oscd-text-button
          id="delete-version"
          class="danger"
          @click=${() => (this.confirming = 'version')}
          >${msg('Delete version')}</oscd-text-button
        >
        <span class="spacer"></span>
        <oscd-outlined-button id="tag" @click=${() => this.emit('stencil-tag', version)}
          >${msg('Tag IEDs in this document…')}<oscd-icon slot="icon">sell</oscd-icon></oscd-outlined-button
        >
      </div>
    </div>
    <div class="card mappings">
      <h3>${msg('Control blocks')}</h3>
      <oscd-stencil-mapping-table
        .controlBlocks=${version.ControlBlocks}
      ></oscd-stencil-mapping-table>
    </div>`;
  }

  private confirmation(): { title: string; text: string; run: () => void } | null {
    const app = this.application;
    switch (this.confirming) {
      case 'version':
        return app && this.version
          ? {
            title: msg('Delete this version?'),
            text: msg(str`${app.name} ${this.version.version} is removed from this stencil. Documents are not changed.`),
            run: () => {
              this.change(removeApplicationVersion(this.stencil, app, this.version!.version));
            }
          }
          : null;
      case 'application':
        return app
          ? {
            title: msg('Delete this application?'),
            text: msg(str`${app.name} and its ${app.versions.length} versions are removed from this stencil. Documents are not changed.`),
            run: () => this.change(removeApplication(this.stencil, app))
          }
          : null;
      case 'stencil':
        return {
          title: msg('Remove this stencil from the library?'),
          text: msg(str`${this.stencil.name} ${this.stencil.version} is removed. Export it first to keep a copy.`),
          run: () => this.emit('stencil-remove', this.currentId)
        };
      default:
        return null;
    }
  }

  private renderConfirmation(): TemplateResult {
    const confirmation = this.confirmation();
    return html`<oscd-dialog
      id="confirm"
      ?open=${!!confirmation}
      @closed=${(e: Event) => {
        if (e.target === e.currentTarget) {
          this.confirming = null;
        }
      }}
    >
      <div slot="headline">${confirmation?.title}</div>
      <div slot="content">${confirmation?.text}</div>
      <div slot="actions">
        <oscd-text-button id="cancel" @click=${() => (this.confirming = null)}
          >${msg('Cancel')}</oscd-text-button
        >
        <oscd-filled-button
          id="confirm-ok"
          @click=${() => {
            confirmation?.run();
            this.confirming = null;
          }}
          >${msg('Delete')}</oscd-filled-button
        >
      </div>
    </oscd-dialog>`;
  }

  render(): TemplateResult {
    const app = this.application;
    const version = this.version;
    const selectedId = this.selection ? nodeId(this.selection) : '';

    return html`${this.renderLibrary()}
      <div class="manage">
        <div class="card" id="tree-card">
          <h2>${msg('Applications')}</h2>
          ${this.stencil.applications.length === 0
            ? html`<p class="hint" id="empty">
                ${msg('This stencil has no applications yet. Import a stencil, or capture one from a document.')}
              </p>`
            : html`<oscd-tree
                .data=${this.tree()}
                .selectedIds=${selectedId ? [selectedId] : []}
                .expandedIds=${this.expandedIds()}
                selectionMode="single"
                .renderItem=${({
                  node,
                  selected
                }: {
                  node: Node;
                  selected: boolean;
                }) =>
                  html`<oscd-tree-item ?selected=${selected}>
                    ${node.icon
                      ? html`<oscd-icon slot="start">${node.icon}</oscd-icon>`
                      : nothing}
                    <span slot="headline">${node.label}</span>
                  </oscd-tree-item>`}
                @selected-ids-changed=${(e: CustomEvent<{ selectedIds: string[] }>) =>
                  this.select(e.detail.selectedIds[0])}
              ></oscd-tree>`}
        </div>
        <div class="detail">
          ${app ? this.renderApplication(app) : html`<p class="hint" id="pick">${msg('Choose an application or version to see and change it.')}</p>`}
          ${app && version ? this.renderVersion(app, version) : nothing}
        </div>
      </div>
      ${this.renderConfirmation()}`;
  }

  private expandedIds(): string[] {
    return [
      ...new Set(
        this.stencil.applications.flatMap(app => [
          app.category,
          nodeId(app)
        ])
      )
    ];
  }

  static styles = [
    ...themeStyles,
    css`
      :host {
        color: var(--oscd-base00);
        container-type: inline-size;
        display: block;
        padding: 12px;
      }

      h2,
      h3 {
        font-weight: 400;
        margin: 0 0 16px;
      }

      .card {
        background: var(--oscd-base2);
        border-radius: var(--md-sys-shape-corner-medium);
        margin-bottom: 16px;
        padding: 16px 20px;
      }

      .row {
        align-items: center;
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 8px;
      }

      .manage {
        display: grid;
        gap: 16px;
        grid-template-columns: minmax(280px, 1fr) minmax(0, 2.5fr);
      }

      @container (max-width: 800px) {
        .manage {
          grid-template-columns: minmax(0, 1fr);
        }

        #tree-card {
          max-height: 40vh;
        }
      }

      #functions {
        display: grid;
        gap: 12px;
      }

      .function {
        background: var(--oscd-base3);
        border-radius: var(--md-sys-shape-corner-small);
        display: grid;
        gap: 12px;
        padding: 12px;
      }

      .requirement {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      @container (max-width: 1000px) {
        .requirement {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      .fields {
        display: grid;
        gap: 12px;
        max-width: 560px;
      }

      #tree-card {
        align-self: start;
        max-height: 70vh;
        overflow-y: auto;
      }

      .switch {
        align-items: center;
        display: flex;
        gap: 12px;
      }

      .muted,
      .hint {
        color: var(--oscd-base0);
      }

      .actions {
        align-items: center;
        display: flex;
        gap: 8px;
        margin-top: 16px;
      }

      .spacer {
        flex: 1;
      }

      .danger {
        --md-text-button-label-text-color: var(--oscd-error);
      }

      #remove-stencil {
        margin-left: auto;
      }

      .mappings {
        overflow-x: auto;
      }

    `
  ];
}
