import { css, html, LitElement, nothing, PropertyValues, TemplateResult } from 'lit';
import { prefersReducedMotion } from './shared/motion.js';

import { property, query, state } from 'lit/decorators.js';
import { keyed } from 'lit/directives/keyed.js';
import { msg, str, updateWhenLocaleChanges } from '@lit/localize';
import { ScopedElementsMixin } from '@open-wc/scoped-elements/lit-element.js';

import { OscdDialog } from '@omicronenergy/oscd-ui/dialog/OscdDialog.js';
import { OscdFilledButton } from '@omicronenergy/oscd-ui/button/OscdFilledButton.js';
import { OscdIcon } from '@omicronenergy/oscd-ui/icon/OscdIcon.js';
import { OscdOutlinedButton } from '@omicronenergy/oscd-ui/button/OscdOutlinedButton.js';
import { OscdOutlinedSelect } from '@omicronenergy/oscd-ui/select/OscdOutlinedSelect.js';
import { OscdOutlinedTextField } from '@omicronenergy/oscd-ui/textfield/OscdOutlinedTextField.js';
import { OscdPrimaryTab } from '@omicronenergy/oscd-ui/tabs/OscdPrimaryTab.js';
import { OscdSelectOption } from '@omicronenergy/oscd-ui/select/OscdSelectOption.js';
import { OscdSelectionList } from '@omicronenergy/oscd-ui/selection-list/OscdSelectionList.js';
import { OscdSnackbar } from '@omicronenergy/oscd-ui/snackbar/OscdSnackbar.js';
import { OscdTabs } from '@omicronenergy/oscd-ui/tabs/OscdTabs.js';
import { OscdTextButton } from '@omicronenergy/oscd-ui/button/OscdTextButton.js';
import type { SelectItem } from '@omicronenergy/oscd-ui/selection-list/OscdSelectionList.js';
import type { SnackbarVariant } from '@omicronenergy/oscd-ui/snackbar/OscdSnackbar.js';

import { newEditEventV2 } from '@openscd/oscd-api/utils.js';

import {
  parseStencil,
  sameStencilContent,
  serializeStencil,
  stencilFileName
} from './foundation/stencil-io.js';
import { newStencil } from './foundation/storage.js';
import {
  addStencil,
  copyName,
  libraryKey,
  loadLibrary,
  recentFirst,
  removeStencilEntry,
  storeLibrary,
  updateStencilEntry,
  useStencilEntry
} from './foundation/library.js';
import type { Library } from './foundation/library.js';
import { tagIedEdits } from './foundation/ied-tags.js';
import type { Application, StencilData } from './foundation/types.js';
import { iedSelectItems, visibleItems } from './foundation/ied-items.js';
import { OscdStencilApply } from './apply/apply-view.js';
import type { StencilApplyDetail } from './apply/apply-view.js';
import type { StencilCaptureDetail } from './capture/capture-wizard.js';
import { OscdStencilManage } from './manage/manage-view.js';
import { OscdStencilHelp } from './shared/help.js';
import { helpWhatIsAStencil } from './shared/help-content.js';
import { useLocale } from './localization.js';
import { themeStyles } from './theme.js';

/**
 * A plugin to apply stencils: reusable sets of GOOSE and SV subscriptions
 * described in JSON. Apply them, manage the stencils, or capture a new
 * application from the open document.
 */
export default class OscdEditorStencil extends ScopedElementsMixin(
  LitElement
) {
  static scopedElements = {
    'oscd-stencil-apply': OscdStencilApply,
    'oscd-stencil-manage': OscdStencilManage,
    'oscd-dialog': OscdDialog,
    'oscd-filled-button': OscdFilledButton,
    'oscd-icon': OscdIcon,
    'oscd-stencil-help': OscdStencilHelp,
    'oscd-outlined-button': OscdOutlinedButton,
    'oscd-outlined-select': OscdOutlinedSelect,
    'oscd-outlined-text-field': OscdOutlinedTextField,
    'oscd-primary-tab': OscdPrimaryTab,
    'oscd-select-option': OscdSelectOption,
    'oscd-selection-list': OscdSelectionList,
    'oscd-snackbar': OscdSnackbar,
    'oscd-tabs': OscdTabs,
    'oscd-text-button': OscdTextButton
  };

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  @property({ attribute: false })
  doc!: XMLDocument;

  @property() docName!: string;

  @property({ attribute: false }) docVersion?: unknown;

  /** The language of the interface, such as `de` or `pt`. */
  @property() locale = 'en';

  /** The tab that is shown: 0 is Apply, 1 is Manage. */
  @state() activeTab = 0;

  /** An imported stencil that would replace a different one with its name and version. */
  @state() pendingImport: StencilData | null = null;

  @property({ attribute: false }) stencilData: StencilData = newStencil();

  /** The stencils that have been imported. */
  @state() library: Library = [];

  /** The library id of `stencilData`, empty while it is not in the library. */
  @state() currentId = '';

  /** The tabs that have been opened. They stay in place so their progress is kept. */
  @state() visited = new Set([0]);

  @state() metadataIedItems: SelectItem[] = [];

  @state() tagOpen = false;

  @state() tagId = '';

  @state() tagVersion = '';

  /** The tags of the functions of the version the tag dialog was opened for. */
  @state() tagChoices: { fn: string; id: string; version: string }[] = [];

  @query('#stencil-metadata-ieds') iedsStencilMetadataUI!: OscdSelectionList;

  @query('#changeStencil') changeStencilUI!: HTMLInputElement;

  @query('#snackBarMessage') snackBarMessageUI!: OscdSnackbar;

  /** Shows a message in the snackbar. */
  notify(message: string, variant: SnackbarVariant = 'info'): void {
    this.snackBarMessageUI?.show({ message, variant });
  }

  private warnedAboutStorage = false;

  /** Keeps the library, and says once if the browser does not let it. */
  private persist(): void {
    if (
      !storeLibrary(this.library) &&
      !this.warnedAboutStorage &&
      this.snackBarMessageUI
    ) {
      this.warnedAboutStorage = true;
      this.notify(
        msg('The stencils could not be kept in this browser. Export them to keep a copy.'),
        'error'
      );
    }
  }

  saveStencilAsFile(): void {
    const blob = new Blob([serializeStencil(this.stencilData)], {
      type: 'application/json'
    });

    const a = document.createElement('a');
    a.download = stencilFileName(this.stencilData);
    a.href = URL.createObjectURL(blob);
    a.dataset.downloadurl = ['application/json', a.download, a.href].join(':');
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => {
      URL.revokeObjectURL(a.href);
    }, 5000);

  }

  /**
   * Adds a validated stencil to the library and makes it current. One that
   * would replace a different stencil with the same name and version waits
   * for the user to choose. Tells whether the text was a valid stencil.
   */
  protected useStencil(json: string): boolean {
    const { stencil, errors } = parseStencil(json);
    if (!stencil) {
      this.notify(errors.join('. '), 'error');
      return false;
    }

    const existing = this.library.find(
      entry =>
        entry.stencil.name === stencil.name &&
        entry.stencil.version === stencil.version
    );
    if (existing && !sameStencilContent(existing.stencil, stencil)) {
      this.pendingImport = stencil;
      return true;
    }
    this.addToLibrary(stencil);
    return true;
  }

  private addToLibrary(stencil: StencilData): void {
    const added = addStencil(this.library, stencil, Date.now());
    this.library = added.library;
    this.currentId = added.id;
    this.stencilData = stencil;
    this.persist();
    this.notify(
      msg(str`Imported ${stencil.name} ${stencil.version}`),
      'success'
    );
  }

  /** Settles an import that has the name and version of another stencil. */
  private resolveImport(choice: 'replace' | 'copy' | 'cancel'): void {
    const stencil = this.pendingImport;
    this.pendingImport = null;
    if (!stencil || choice === 'cancel') {
      return;
    }
    this.addToLibrary(
      choice === 'replace'
        ? stencil
        : { ...stencil, name: copyName(this.library, stencil) }
    );
  }

  private renderImportConflict(): TemplateResult {
    const stencil = this.pendingImport;
    return html`<oscd-dialog
      ?quick=${prefersReducedMotion()}
      id="import-conflict"
      ?open=${!!stencil}
      @closed=${(e: Event) => {
        if (e.target === e.currentTarget && this.pendingImport) {
          this.pendingImport = null;
        }
      }}
    >
      <div slot="headline">${msg('This stencil is already in the library')}</div>
      <div slot="content">
        ${stencil
          ? msg(
            str`${stencil.name} ${stencil.version} is in the library with different content. Replacing it loses the changes made to it here.`
          )
          : nothing}
      </div>
      <div slot="actions">
        <oscd-text-button id="import-cancel" @click=${() => this.resolveImport('cancel')}
          >${msg('Cancel')}</oscd-text-button
        >
        <oscd-text-button id="import-copy" @click=${() => this.resolveImport('copy')}
          >${msg('Keep both')}</oscd-text-button
        >
        <oscd-filled-button id="import-replace" @click=${() => this.resolveImport('replace')}
          >${msg('Replace')}</oscd-filled-button
        >
      </div>
    </oscd-dialog>`;
  }

  async loadStencil(event: Event): Promise<void> {
    const file = (<HTMLInputElement | null>event.target)?.files?.item(0);
    if (!file) {
      return;
    }

    this.useStencil(await file.text());
  }

  connectedCallback(): void {
    super.connectedCallback();
    // restore settings from local storage on plugin loading
    this.restoreSettings();
  }

  /**
   * Restore settings from local storage, applying appropriate defaults
   * if not set or unreadable. The most recently used stencil is current.
   */
  protected restoreSettings(): void {
    this.library = loadLibrary();
    const [latest] = recentFirst(this.library);
    this.currentId = latest?.id ?? '';
    this.stencilData = latest?.stencil ?? newStencil();
  }

  /** Keeps the current stencil in the library. */
  protected storeSettings(): void {
    const pristine =
      !this.currentId &&
      this.stencilData.applications.length === 0 &&
      this.stencilData.name === newStencil().name;
    if (pristine) {
      return;
    }

    if (this.currentId) {
      this.library = updateStencilEntry(
        this.library,
        this.currentId,
        this.stencilData
      );
    } else {
      const added = addStencil(this.library, this.stencilData, Date.now());
      this.library = added.library;
      this.currentId = added.id;
    }
    this.persist();
  }

  private selectStencil(id: string): void {
    const entry = this.library.find(candidate => candidate.id === id);
    if (!entry) {
      return;
    }

    this.library = useStencilEntry(this.library, id, Date.now());
    this.currentId = id;
    this.stencilData = entry.stencil;
    this.persist();
  }

  private removeStencil(id: string): void {
    this.library = removeStencilEntry(this.library, id);
    this.persist();
    const [latest] = recentFirst(this.library);
    this.currentId = latest?.id ?? '';
    this.stencilData = latest?.stencil ?? newStencil();
    this.notify(msg('Removed from the library'), 'success');
  }

  protected updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties);
    // the select sets its value before its options are rendered, so set it
    // again once they are
    const recent = this.shadowRoot?.querySelector<OscdOutlinedSelect>('#recent');
    if (recent && recent.value !== this.currentId) {
      recent.value = this.currentId;
    }
  }

  protected willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties);

    if (changedProperties.has('activeTab') && !this.visited.has(this.activeTab)) {
      this.visited = new Set([...this.visited, this.activeTab]);
    }

    if (changedProperties.has('locale')) {
      useLocale(this.locale);
    }

    // keep the stencil in local storage
    if (changedProperties.has('stencilData')) {
      this.storeSettings();
    }
  }

  /** The IEDs ticked in the tag dialog. */
  private get tagSelection(): Element[] {
    return this.metadataIedItems
      .filter(item => item.selected)
      .map(item => item.attachedElement!);
  }

  private tagIeds(): void {
    const id = this.tagId.trim();
    const version = this.tagVersion.trim();
    const ieds = this.tagSelection;
    if (!id || !version || ieds.length === 0) {
      return;
    }
    const perIed = ieds.map(ied => tagIedEdits(ied, id, version));
    const edits = perIed.flat();
    if (edits.length > 0) {
      this.dispatchEvent(newEditEventV2(edits, { title: msg('Tag IEDs') }));
    }
    const changed = perIed.filter(list => list.length > 0).length;
    this.notify(
      changed === 0
        ? msg('These IEDs already had this tag')
        : changed === 1
          ? msg('Tagged 1 IED')
          : msg(str`Tagged ${changed} IEDs`),
      changed === 0 ? 'info' : 'success'
    );
    this.tagOpen = false;
  }

  renderAddStencilMetadata(): TemplateResult {
    if (!this.doc) {
      return html``;
    }

    const id = this.tagId.trim();
    const version = this.tagVersion.trim();
    const count = this.tagSelection.length;

    return html`<oscd-dialog
      ?quick=${prefersReducedMotion()}
      id="ied-stencil-metadata"
      ?open=${this.tagOpen}
      @closed=${(e: Event) => {
        if (e.target === e.currentTarget) {
          this.tagOpen = false;
        }
      }}
    >
      <div slot="headline">${msg('Tag IEDs')}</div>
      <div slot="content" class="tag-fields">
        <p class="tag-intro">
          ${msg('A tag says which function of a stencil an IED is made for. Only IEDs with the tag a function asks for can fill it.')}
        </p>
        ${this.tagChoices.length > 0
          ? html`<oscd-outlined-select
              id="tag-function"
              label=${msg('Use the tag of the function')}
              @change=${(e: Event) => {
                const choice = this.tagChoices.find(
                  c => c.fn === (e.target as OscdOutlinedSelect).value
                );
                if (choice) {
                  this.tagId = choice.id;
                  this.tagVersion = choice.version;
                }
              }}
            >
              ${this.tagChoices.map(
                (choice, i) => html`<oscd-select-option
                  value=${choice.fn}
                  ?selected=${i === 0}
                  ><div slot="headline">${choice.fn}</div>
                  <div slot="supporting-text">${choice.id} ${choice.version}</div></oscd-select-option
                >`
              )}
            </oscd-outlined-select>`
          : nothing}
        <div class="tag-pair">
          <oscd-outlined-text-field
            id="stencil-id"
            label=${msg('Tag Id')}
            required
            .value=${this.tagId}
            .error=${!id}
            .errorText=${id ? '' : msg('A tag Id is needed')}
            @input=${(e: Event) => (this.tagId = (e.target as OscdOutlinedTextField).value)}
          ></oscd-outlined-text-field>
          <oscd-outlined-text-field
            id="stencil-ver"
            label=${msg('Tag version')}
            required
            .value=${this.tagVersion}
            .error=${!version}
            .errorText=${version ? '' : msg('A version is needed')}
            @input=${(e: Event) => (this.tagVersion = (e.target as OscdOutlinedTextField).value)}
          ></oscd-outlined-text-field>
        </div>
        <div class="list-tools">
          <oscd-text-button
            id="tag-select-all"
            @click=${() => this.chooseAllForTags(true)}
            >${msg('Select all')}</oscd-text-button
          >
          <oscd-text-button
            id="tag-select-none"
            @click=${() => this.chooseAllForTags(false)}
            >${msg('Select none')}</oscd-text-button
          >
        </div>
        <oscd-selection-list
          id="stencil-metadata-ieds"
          filterable
          multiselect
          .items=${this.metadataIedItems}
          @selection-list-change=${() => this.requestUpdate()}
        ></oscd-selection-list>
      </div>
      <div slot="actions">
        <oscd-text-button id="tag-cancel" @click=${() => (this.tagOpen = false)}
          >${msg('Cancel')}</oscd-text-button
        >
        <oscd-filled-button
          id="tag-apply"
          ?disabled=${count === 0 || !id || !version}
          @click=${() => this.tagIeds()}
          >${count === 1
            ? msg('Tag 1 IED')
            : msg(str`Tag ${count} IEDs`)}</oscd-filled-button
        >
      </div>
    </oscd-dialog>`;
  }

  /** Ticks or clears the IEDs the search of the list shows. */
  private chooseAllForTags(selected: boolean): void {
    const shown = new Set(visibleItems(this.iedsStencilMetadataUI, this.metadataIedItems));
    this.metadataIedItems = this.metadataIedItems.map(item =>
      shown.has(item) ? { ...item, selected } : item
    );
  }



  private onApply(event: CustomEvent<StencilApplyDetail>): void {
    event.stopPropagation();
    const { edits, title } = event.detail;
    this.dispatchEvent(newEditEventV2(edits, { title }));
  }

  private onNewStencil(event: CustomEvent<{ name: string; version: string }>): void {
    event.stopPropagation();
    const { name, version } = event.detail;
    const added = addStencil(
      this.library,
      { name, version, applications: [] },
      Date.now()
    );
    this.library = added.library;
    this.currentId = added.id;
    this.stencilData = added.library.find(entry => entry.id === added.id)!.stencil;
    this.persist();
    this.notify(msg(str`Created stencil ${name} ${version}`), 'success');
  }

  /** Shows Manage with the dialog for a new stencil open. */
  private async startNewStencil(): Promise<void> {
    this.activeTab = 1;
    await this.updateComplete;
    this.shadowRoot
      ?.querySelector<OscdStencilManage>('oscd-stencil-manage')
      ?.openNew();
  }

  /** Shows Manage with the capture wizard open. */
  private async openCapture(): Promise<void> {
    this.activeTab = 1;
    await this.updateComplete;
    this.shadowRoot
      ?.querySelector<OscdStencilManage>('oscd-stencil-manage')
      ?.openCapture();
  }

  private onStencilChange(event: CustomEvent<StencilData>): void {
    event.stopPropagation();
    const next = event.detail;
    const clash = this.library.some(
      entry =>
        entry.id !== this.currentId &&
        entry.stencil.name === next.name &&
        entry.stencil.version === next.version
    );
    if (clash) {
      this.notify(msg('A stencil with this name and version exists'), 'error');
      return;
    }
    this.stencilData = next;
    this.storeSettings();
  }

  private onTag(event: CustomEvent<Application | undefined>): void {
    event.stopPropagation();
    if (!this.doc) {
      return;
    }
    const version = event.detail;
    this.tagChoices = version
      ? Object.entries(version.IEDS).flatMap(([fn, ied]) =>
        ied.privates[0]
          ? [
            {
              fn,
              id: ied.privates[0]['OpenSCD-Stencil-Id'],
              version: ied.privates[0]['OpenSCD-Stencil-Version']
            }
          ]
          : []
      )
      : [];
    const [first] = this.tagChoices;
    this.tagId = first?.id ?? '';
    this.tagVersion = first?.version ?? '1.0.0';
    this.metadataIedItems = iedSelectItems(this.doc, true);
    this.tagOpen = true;
  }


  private renderManage(): TemplateResult {
    return html`<oscd-stencil-manage
      .doc=${this.doc}
      .docVersion=${this.docVersion}
      .stencil=${this.stencilData}
      .library=${recentFirst(this.library)}
      .currentId=${this.currentId}
      @stencil-change=${this.onStencilChange}
      @stencil-new=${this.onNewStencil}
      @stencil-select=${(e: CustomEvent<string>) => {
        e.stopPropagation();
        this.selectStencil(e.detail);
      }}
      @stencil-remove=${(e: CustomEvent<string>) => {
        e.stopPropagation();
        this.removeStencil(e.detail);
      }}
      @stencil-import=${(e: Event) => {
        e.stopPropagation();
        this.changeStencilUI.click();
      }}
      @stencil-export=${(e: Event) => {
        e.stopPropagation();
        this.saveStencilAsFile();
      }}
      @stencil-tag=${this.onTag}
      @stencil-capture=${this.onCapture}
    ></oscd-stencil-manage>`;
  }

  private renderFirstRun(): TemplateResult {
    return html`<div class="first-run" id="first-run">
      <div class="with-help"><h1>
        ${msg('Apply a stencil')}</h1><oscd-stencil-help heading=${msg('What is a stencil?')}>${helpWhatIsAStencil()}</oscd-stencil-help></div>
      <p>
        ${msg('A stencil sets up the GOOSE and sampled value subscriptions of a group of IEDs in one step. You have not imported one yet.')}
      </p>
      <div class="first-run-actions">
        <oscd-filled-button id="first-open" @click=${() => this.changeStencilUI.click()}
          >${msg('Import a stencil file')}<oscd-icon slot="icon" aria-hidden="true">file_open</oscd-icon></oscd-filled-button
        >
        <oscd-outlined-button id="first-new" @click=${() => this.startNewStencil()}
          >${msg('Start a new stencil')}<oscd-icon slot="icon" aria-hidden="true">note_add</oscd-icon></oscd-outlined-button
        >
        <oscd-outlined-button
          id="first-create"
          ?disabled=${!this.doc}
          @click=${() => this.openCapture()}
          >${msg('Create one from this document')}<oscd-icon slot="icon" aria-hidden="true">construction</oscd-icon></oscd-outlined-button
        >
      </div>
    </div>`;
  }

  renderUse(): TemplateResult {
    if (this.library.length === 0 && this.stencilData.applications.length === 0) {
      return this.renderFirstRun();
    }

    return html`
      <div id="headline">
        <h1 id="stencilName">
          ${this.stencilData.name}<code id="stencilVersion"
            >${this.stencilData.version}</code
          >
        </h1>
        <div id="menuUse">
          ${this.library.length > 1
            ? keyed(
              libraryKey(this.library, this.currentId),
              html`<oscd-outlined-select
                id="recent"
                label=${msg('Selected stencil')}
                .value=${this.currentId}
                @change=${(e: Event) =>
                  this.selectStencil((e.target as OscdOutlinedSelect).value)}
              >
                ${recentFirst(this.library).map(
                  entry =>
                    html`<oscd-select-option
                      value=${entry.id}
                      ?selected=${entry.id === this.currentId}
                      ><div slot="headline">
                        ${entry.stencil.name} ${entry.stencil.version}
                      </div></oscd-select-option
                    >`
                )}
              </oscd-outlined-select>`
            )
            : nothing}
          <oscd-outlined-button
            id="changeStencilBtn"
            class="button"
            @click=${() => {
              this.changeStencilUI.click();
            }}
            >${msg('Import stencil…')}
            <oscd-icon slot="icon" aria-hidden="true">file_open</oscd-icon>
          </oscd-outlined-button>
        </div>
      </div>
      <oscd-stencil-apply
        .doc=${this.doc}
        .docVersion=${this.docVersion}
        .stencil=${this.stencilData}
        @stencil-apply=${this.onApply}
        @stencil-tag=${this.onTag}
      ></oscd-stencil-apply>
    `;
  }

  private onCapture(event: CustomEvent<StencilCaptureDetail>): void {
    event.stopPropagation();
    const { stencil, category, name, version } = event.detail;
    this.stencilData = stencil;
    this.storeSettings();
    this.notify(
      msg(str`Saved ${category} › ${name} ${version} to the stencil`),
      'success'
    );
  }

  /** A tab that was opened once is kept, hidden, so leaving it loses nothing. */
  private renderTab(index: number, content: () => TemplateResult): TemplateResult | typeof nothing {
    return this.visited.has(index)
      ? html`<div class="view" ?hidden=${this.activeTab !== index}>${content()}</div>`
      : nothing;
  }

  render(): TemplateResult {
    return html`<oscd-tabs
        .activeTabIndex=${this.activeTab}
        @change=${(event: Event) => {
          this.activeTab = (event.target as OscdTabs).activeTabIndex;
        }}
      >
        <oscd-primary-tab inline-icon>
          <oscd-icon slot="icon" aria-hidden="true">play_circle</oscd-icon>${msg('Apply')}
        </oscd-primary-tab>
        <oscd-primary-tab inline-icon>
          <oscd-icon slot="icon" aria-hidden="true">folder_managed</oscd-icon>${msg('Manage')}
        </oscd-primary-tab>
      </oscd-tabs>
      <section>
        ${this.renderTab(0, () => this.renderUse())}
        ${this.renderTab(1, () => this.renderManage())}
      </section>
      <input
        id="changeStencil"
        @click=${({ target }: MouseEvent) => {
          (<HTMLInputElement>target).value = '';
        }}
        @change=${this.loadStencil}
        type="file"
        accept=".json"
      />
      ${this.renderImportConflict()}
      <oscd-snackbar id="snackBarMessage"></oscd-snackbar>
      ${this.renderAddStencilMetadata()}`;
  }

  static styles = [
    ...themeStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
      }

      h1 {
        color: var(--stencil-text);
        font-family: var(--oscd-text-font), sans-serif;
        font-weight: 300;
        line-height: 48px;
        margin: 0;
        overflow: hidden;
        padding-left: 0.3em;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      oscd-tabs {
        width: 100%;
      }

      section {
        background-color: var(--oscd-base3);
        max-height: 100%;
        padding: 12px;
        position: relative;
      }

      #headline {
        align-items: center;
        display: flex;
        flex-wrap: wrap;
      }

      #stencilName {
        flex: 1;
      }

      #stencilVersion {
        padding: 10px;
      }

      #menuUse {
        align-items: center;
        display: inline-flex;
        gap: 12px;
      }

      #changeStencil {
        display: none;
      }

      .view[hidden] {
        display: none;
      }

      .list-tools {
        display: flex;
        gap: 8px;
        margin-bottom: 4px;
      }

      .tag-fields {
        color: var(--stencil-text);
        display: grid;
        gap: 12px;
        min-width: min(420px, 80vw);
      }

      .tag-intro {
        margin: 0;
      }

      .tag-pair {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
      }

      .first-run {
        color: var(--stencil-text);
        max-width: 640px;
        padding: 24px 8px;
      }

      .first-run h1 {
        padding-left: 0;
      }

      .first-run p {
        margin: 8px 0 20px;
      }

      .first-run-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }


      .button {
        margin: 10px;
      }

      .with-help {
        align-items: center;
        display: flex;
        gap: 4px;
        margin-bottom: 12px;
      }

      .with-help > h1,
      .with-help > h2,
      .with-help > h3 {
        margin: 0;
      }
    `
  ];
}
