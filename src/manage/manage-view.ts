import { css, html, LitElement, nothing } from 'lit';
import type { PropertyValues, TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { msg, str, updateWhenLocaleChanges } from '@lit/localize';
import { ScopedElementsMixin } from '@open-wc/scoped-elements/lit-element.js';

import { OscdDialog } from '@omicronenergy/oscd-ui/dialog/OscdDialog.js';
import { OscdFilledButton } from '@omicronenergy/oscd-ui/button/OscdFilledButton.js';
import { OscdIcon } from '@omicronenergy/oscd-ui/icon/OscdIcon.js';
import { OscdIconButton } from '@omicronenergy/oscd-ui/iconbutton/OscdIconButton.js';
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
import { OscdStencilCapture } from '../capture/capture-wizard.js';
import { OscdStencilJson } from '../json/json-editor.js';
import type { JsonScope } from '../foundation/json-scope.js';
import { OscdStencilMappingTable } from '../shared/mapping-table.js';
import { problemText } from '../shared/problem-text.js';
import { OscdStencilHelp } from '../shared/help.js';
import { helpManage, helpTags } from '../shared/help-content.js';
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
    'oscd-icon-button': OscdIconButton,
    'oscd-stencil-help': OscdStencilHelp,
    'oscd-outlined-button': OscdOutlinedButton,
    'oscd-outlined-select': OscdOutlinedSelect,
    'oscd-outlined-text-field': OscdOutlinedTextField,
    'oscd-select-option': OscdSelectOption,
    'oscd-stencil-capture': OscdStencilCapture,
    'oscd-stencil-json': OscdStencilJson,
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

  /** The open document, which stencil applications are captured from. */
  @property({ attribute: false }) doc?: XMLDocument;

  /** The stencils that have been imported, the most recently used first. */
  @property({ attribute: false }) library: readonly LibraryEntry[] = [];

  @property() currentId = '';

  /** What is shown: the stencils, the capture wizard, or the JSON editor. */
  @state() view: 'browse' | 'capture' | 'json' = 'browse';

  @state() jsonScope: JsonScope = { kind: 'stencil' };

  /** The wizard is kept once opened, so leaving it does not lose its progress. */
  @state() captureOpened = false;

  /** The open branches of the tree. It starts closed. */
  @state() expanded: string[] = [];

  /** The stencil name and version being typed in the rename dialog. */
  @state() renaming = false;

  @state() renameName = '';

  @state() renameVersion = '';

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
    if (changed.has('selection')) {
      this.reveal();
    }
    if (changed.has('currentId')) {
      this.selection = null;
      this.expanded = [];
      this.problems = {};
      this.view = 'browse';
    }
    // an edited name or version can take the JSON being edited out of the stencil
    if (changed.has('stencil') && this.view === 'json') {
      const scope = this.jsonScope;
      const app =
        scope.kind === 'stencil'
          ? undefined
          : this.stencil.applications.find(
            a => a.category === scope.key.category && a.name === scope.key.name
          );
      if (
        scope.kind !== 'stencil' &&
        (!app ||
          (scope.kind === 'version' &&
            !app.versions.some(v => v.version === scope.version)))
      ) {
        this.view = 'browse';
      }
    }
  }

  /** Shows the capture wizard, which makes an application from the open document. */
  openCapture(): void {
    this.captureOpened = true;
    this.view = 'capture';
  }

  private editJson(scope: JsonScope): void {
    this.jsonScope = scope;
    this.view = 'json';
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
              icon: 'tag',
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
      <h2 class="with-help">
        ${msg('Stencil library')}
        <oscd-stencil-help heading=${msg('Managing stencils')}>${helpManage()}</oscd-stencil-help>
      </h2>
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
        <div class="tools" role="toolbar" aria-label=${msg('Stencil actions')}>
          <oscd-icon-button
            id="rename"
            aria-label=${msg('Rename stencil')}
            title=${msg('Rename stencil')}
            ?disabled=${!this.currentId}
            @click=${() => this.openRename()}
            ><oscd-icon aria-hidden="true">edit</oscd-icon></oscd-icon-button
          >
          <oscd-icon-button
            id="import"
            aria-label=${msg('Import stencil file')}
            title=${msg('Import stencil file')}
            @click=${() => this.emit('stencil-import')}
            ><oscd-icon aria-hidden="true">file_open</oscd-icon></oscd-icon-button
          >
          <oscd-icon-button
            id="export"
            aria-label=${msg('Export stencil file')}
            title=${msg('Export stencil file')}
            @click=${() => this.emit('stencil-export')}
            ><oscd-icon aria-hidden="true">download</oscd-icon></oscd-icon-button
          >
          <oscd-icon-button
            id="edit-json-stencil"
            aria-label=${msg('Edit as JSON')}
            title=${msg('Edit as JSON')}
            @click=${() => this.editJson({ kind: 'stencil' })}
            ><oscd-icon aria-hidden="true">data_object</oscd-icon></oscd-icon-button
          >
          <span class="divider" aria-hidden="true"></span>
          <oscd-icon-button
            id="remove-stencil"
            class="danger-icon"
            aria-label=${msg('Remove from library')}
            title=${msg('Remove from library')}
            ?disabled=${!this.currentId}
            @click=${() => (this.confirming = 'stencil')}
            ><oscd-icon aria-hidden="true">delete</oscd-icon></oscd-icon-button
          >
        </div>
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
            <span class="spacer"></span>
            <oscd-outlined-button
              id="edit-json-application"
              @click=${() => this.editJson({ kind: 'application', key })}
              >${msg('Edit as JSON')}<oscd-icon slot="icon" aria-hidden="true">data_object</oscd-icon></oscd-outlined-button
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
          str`${summary.functions} IEDs, ${summary.goose} GOOSE, ${summary.smv} SV, ${summary.supervisions} supervisions`
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
        <oscd-outlined-button
          id="edit-json-version"
          @click=${() => this.editJson({ kind: 'version', key, version: version.version })}
          >${msg('Edit as JSON')}<oscd-icon slot="icon" aria-hidden="true">data_object</oscd-icon></oscd-outlined-button
        >
        <oscd-stencil-help heading=${msg('Stencil tags')}>${helpTags()}</oscd-stencil-help>
        <oscd-outlined-button id="tag" @click=${() => this.emit('stencil-tag', version)}
          >${msg('Tag IEDs in this document…')}<oscd-icon slot="icon" aria-hidden="true">sell</oscd-icon></oscd-outlined-button
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

  private backButton(): TemplateResult {
    return html`<oscd-text-button id="back" @click=${() => (this.view = 'browse')}
      ><oscd-icon slot="icon" aria-hidden="true">arrow_back</oscd-icon>${msg('Back to stencils')}</oscd-text-button
    >`;
  }

  private renderCapture(): TemplateResult {
    return html`<div class="subview" id="capture-view" ?hidden=${this.view !== 'capture'}>
      ${this.backButton()}
      <oscd-stencil-capture
        .doc=${this.doc}
        .stencil=${this.stencil}
        @stencil-goto=${(e: CustomEvent<string>) => {
          e.stopPropagation();
          this.view = 'browse';
        }}
      ></oscd-stencil-capture>
    </div>`;
  }

  private renderJson(): TemplateResult {
    return html`<div class="subview" id="json-view">
      ${this.backButton()}
      <oscd-stencil-json
        .stencil=${this.stencil}
        .scope=${this.jsonScope}
      ></oscd-stencil-json>
    </div>`;
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
          class="danger-filled"
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

    return html`<div class="browse" ?hidden=${this.view !== 'browse'}>
        ${this.renderLibrary()}
        <div class="manage">
        <div class="card" id="tree-card">
          <div class="card-head">
            <h2>${msg('Applications')}</h2>
            <div class="tools" role="toolbar" aria-label=${msg('Tree actions')}>
              <oscd-icon-button
                id="expand-all"
                aria-label=${msg('Expand all')}
                title=${msg('Expand all')}
                ?disabled=${this.stencil.applications.length === 0}
                @click=${() => this.expandAll()}
                ><oscd-icon aria-hidden="true">unfold_more</oscd-icon></oscd-icon-button
              >
              <oscd-icon-button
                id="collapse-all"
                aria-label=${msg('Collapse all')}
                title=${msg('Collapse all')}
                ?disabled=${this.stencil.applications.length === 0}
                @click=${() => this.collapseAll()}
                ><oscd-icon aria-hidden="true">unfold_less</oscd-icon></oscd-icon-button
              >
            </div>
            <oscd-filled-button
              id="capture"
              ?disabled=${!this.doc}
              aria-label=${this.doc
                ? msg('Create an application from the open document')
                : msg('Open a document to create an application from it')}
              title=${this.doc
                ? msg('Create an application from the open document')
                : msg('Open a document to create an application from it')}
              @click=${() => this.openCapture()}
              >${msg('Create')}<oscd-icon slot="icon" aria-hidden="true">add</oscd-icon></oscd-filled-button
            >
          </div>
          ${this.stencil.applications.length === 0
            ? html`<p class="hint" id="empty">
                ${msg('This stencil has no applications yet. Import a stencil, or capture one from a document.')}
              </p>`
            : html`<oscd-tree
                .data=${this.tree()}
                .selectedIds=${selectedId ? [selectedId] : []}
                .expandedIds=${this.expanded}
                @expanded-ids-changed=${(e: CustomEvent<{ expandedIds: string[] }>) => (this.expanded = e.detail.expandedIds)}
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
                      ? html`<oscd-icon slot="start" aria-hidden="true">${node.icon}</oscd-icon>`
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
      </div>
      ${this.captureOpened ? this.renderCapture() : nothing}
      ${this.view === 'json' ? this.renderJson() : nothing}
      ${this.renderRename()}
      ${this.renderConfirmation()}`;
  }

  /** Opens the branches above the selection so that it can be seen. */
  private reveal(): void {
    const selection = this.selection;
    if (!selection) {
      return;
    }
    const ancestors = [selection.category, nodeId(selection.version ? { ...selection, version: undefined } : selection)];
    const missing = ancestors.filter(id => !this.expanded.includes(id));
    if (missing.length > 0) {
      this.expanded = [...this.expanded, ...missing];
    }
  }

  private openRename(): void {
    this.renameName = this.stencil.name;
    this.renameVersion = this.stencil.version;
    this.renaming = true;
  }

  private get renameProblems(): { name?: string; version?: string } {
    return {
      ...(this.renameName.trim() ? {} : { name: msg('A name is needed') }),
      ...(this.renameVersion.trim() ? {} : { version: msg('A version is needed') })
    };
  }

  private saveRename(): void {
    if (Object.keys(this.renameProblems).length > 0) {
      return;
    }
    this.change({
      ...this.stencil,
      name: this.renameName.trim(),
      version: this.renameVersion.trim()
    });
    this.renaming = false;
  }

  private renderRename(): TemplateResult {
    const problems = this.renameProblems;
    const unchanged =
      this.renameName.trim() === this.stencil.name &&
      this.renameVersion.trim() === this.stencil.version;

    return html`<oscd-dialog
      id="rename-dialog"
      ?open=${this.renaming}
      @closed=${(e: Event) => {
        if (e.target === e.currentTarget) {
          this.renaming = false;
        }
      }}
    >
      <div slot="headline">${msg('Rename stencil')}</div>
      <form
        slot="content"
        id="rename-form"
        method="dialog"
        class="rename-fields"
        @submit=${(e: Event) => {
          e.preventDefault();
          this.saveRename();
        }}
      >
        <oscd-outlined-text-field
          id="rename-name"
          label=${msg('Name')}
          .value=${this.renameName}
          .error=${!!problems.name}
          .errorText=${problems.name ?? ''}
          @input=${(e: Event) => (this.renameName = (e.target as OscdOutlinedTextField).value)}
        ></oscd-outlined-text-field>
        <oscd-outlined-text-field
          id="rename-version"
          label=${msg('Version')}
          .value=${this.renameVersion}
          .error=${!!problems.version}
          .errorText=${problems.version ?? ''}
          @input=${(e: Event) => (this.renameVersion = (e.target as OscdOutlinedTextField).value)}
        ></oscd-outlined-text-field>
      </form>
      <div slot="actions">
        <oscd-text-button id="rename-cancel" @click=${() => (this.renaming = false)}
          >${msg('Cancel')}</oscd-text-button
        >
        <oscd-filled-button
          id="rename-save"
          ?disabled=${Object.keys(problems).length > 0 || unchanged}
          @click=${() => this.saveRename()}
          >${msg('Save')}</oscd-filled-button
        >
      </div>
    </oscd-dialog>`;
  }

  private expandAll(): void {
    this.expanded = this.expandedIds();
  }

  private collapseAll(): void {
    this.expanded = [];
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

      [hidden] {
        display: none !important;
      }

      .subview {
        display: block;
      }

      .card {
        background: var(--oscd-base2);
        border-radius: var(--md-sys-shape-corner-medium);
        margin-bottom: 16px;
        padding: 16px 20px;
      }

      .card-head {
        align-items: center;
        display: flex;
        gap: 12px;
        justify-content: space-between;
        margin-bottom: 8px;
      }

      .card-head h2 {
        margin: 0;
      }

      #stencils {
        flex: 1;
        min-width: 220px;
      }

      .rename-fields {
        display: grid;
        gap: 12px;
        min-width: min(320px, 70vw);
      }

      .tools {
        align-items: center;
        display: flex;
        gap: 4px;
        margin-left: auto;
      }

      .card-head .tools {
        margin-left: 0;
      }

      .card-head h2 {
        flex: 1;
      }

      .tools oscd-icon-button {
        --md-icon-button-icon-color: var(--stencil-text);
      }

      .tools .danger-icon {
        --md-icon-button-icon-color: var(--stencil-danger);
      }

      .divider {
        align-self: stretch;
        background: var(--stencil-border);
        margin: 8px 4px;
        width: 1px;
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
        grid-template-columns: minmax(320px, 1fr) minmax(0, 2.5fr);
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

      @container (max-width: 520px) {
        .requirement {
          grid-template-columns: minmax(0, 1fr);
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
        color: var(--stencil-text);
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

      .danger {
        --md-text-button-label-text-color: var(--stencil-danger);
      }

      .danger-filled {
        --md-filled-button-container-color: var(--stencil-danger);
        --md-filled-button-label-text-color: var(--oscd-base3);
        --md-filled-button-icon-color: var(--oscd-base3);
      }

      .mappings {
        overflow: visible;
      }

      .with-help {
        align-items: center;
        display: flex;
        gap: 4px;
      }
    `
  ];
}
