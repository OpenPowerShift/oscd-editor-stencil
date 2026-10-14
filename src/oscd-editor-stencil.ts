import { css, html, LitElement, nothing, PropertyValues, TemplateResult } from 'lit';

import { property, query, state } from 'lit/decorators.js';
import { msg, str } from '@lit/localize';
import { ScopedElementsMixin } from '@open-wc/scoped-elements/lit-element.js';

import { OscdDialog } from '@omicronenergy/oscd-ui/dialog/OscdDialog.js';
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
  serializeStencil,
  stencilFileName
} from './foundation/stencil-io.js';
import { newStencil } from './foundation/storage.js';
import {
  addStencil,
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
import { iedSelectItems } from './foundation/ied-items.js';
import { OscdStencilApply } from './apply/apply-view.js';
import type { StencilApplyDetail } from './apply/apply-view.js';
import { OscdStencilCapture } from './capture/capture-wizard.js';
import type { StencilCaptureDetail } from './capture/capture-wizard.js';
import { OscdStencilManage } from './manage/manage-view.js';
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
    'oscd-stencil-capture': OscdStencilCapture,
    'oscd-stencil-manage': OscdStencilManage,
    'oscd-dialog': OscdDialog,
    'oscd-icon': OscdIcon,
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

  @property({ attribute: false })
  doc!: XMLDocument;

  @property() docName!: string;

  @property({ attribute: false }) docVersion?: unknown;

  @property() tabIndex: number = 0;

  @property() stencilData: StencilData = newStencil();

  /** The stencils that have been imported. */
  @state() library: Library = [];

  /** The library id of `stencilData`, empty while it is not in the library. */
  @state() currentId = '';

  @state() metadataIedItems: SelectItem[] = [];

  @query('#outputView') outputStencilUI!: OscdOutlinedTextField;

  @query('#ied-stencil-metadata') iedStencilMetadataUI!: OscdDialog;

  @query('#stencil-metadata-ieds') iedsStencilMetadataUI!: OscdSelectionList;

  @query('#stencil-id') stencilMetadataIdUI!: OscdOutlinedTextField;

  @query('#stencil-ver') stencilMetadataVerUI!: OscdOutlinedTextField;

  @query('#changeStencil') changeStencilUI!: HTMLInputElement;

  @query('#snackBarMessage') snackBarMessageUI!: OscdSnackbar;

  /** Shows a message in the snackbar. */
  notify(message: string, variant: SnackbarVariant = 'info'): void {
    this.snackBarMessageUI.show({ message, variant });
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

  /** Replaces the stencil with a validated one. Tells whether it was valid. */
  protected useStencil(json: string, replaceCurrent = false): boolean {
    const { stencil, errors } = parseStencil(json);
    if (!stencil) {
      this.notify(errors.join('. '), 'error');
      return false;
    }

    if (replaceCurrent && this.currentId) {
      this.library = updateStencilEntry(this.library, this.currentId, stencil);
    } else {
      const added = addStencil(this.library, stencil, Date.now());
      this.library = added.library;
      this.currentId = added.id;
    }
    this.stencilData = stencil;
    storeLibrary(this.library);
    return true;
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
    storeLibrary(this.library);
  }

  private selectStencil(id: string): void {
    const entry = this.library.find(candidate => candidate.id === id);
    if (!entry) {
      return;
    }

    this.library = useStencilEntry(this.library, id, Date.now());
    this.currentId = id;
    this.stencilData = entry.stencil;
    storeLibrary(this.library);
  }

  private removeStencil(id: string): void {
    this.library = removeStencilEntry(this.library, id);
    storeLibrary(this.library);
    const [latest] = recentFirst(this.library);
    this.currentId = latest?.id ?? '';
    this.stencilData = latest?.stencil ?? newStencil();
    this.notify(msg('Removed from the library'), 'success');
  }

  protected willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties);

    // keep the stencil in local storage
    if (changedProperties.has('stencilData')) {
      this.storeSettings();
    }
  }

  renderAddStencilMetadata(): TemplateResult {
    if (!this.doc) {
      return html``;
    }

    // TODO: Can't use ?disabled=${this.iedsStencilMetadataUI?.selectedElements.length === 0} on button?

    return html`<oscd-dialog
      id="ied-stencil-metadata"
      @cancel=${(event: Event) => {
        event.preventDefault();
      }}
    >
      <div slot="headline">Select IEDs to add Stencil metadata to</div>
      <form slot="content" id="stencil-metadata" method="dialog">
        <oscd-outlined-text-field
          id="stencil-id"
          label="Stencil Id"
          value="My Stencil"
        ></oscd-outlined-text-field>
        <oscd-outlined-text-field
          id="stencil-ver"
          label="Stencil Version"
          value="1.0.0"
        ></oscd-outlined-text-field>
        <oscd-selection-list
          id="stencil-metadata-ieds"
          filterable
          multiselect
          .items=${this.metadataIedItems}
        ></oscd-selection-list>
      </form>
      <div slot="actions">
        <oscd-text-button form="stencil-metadata" value="reset"
          >Cancel</oscd-text-button
        >
        <oscd-text-button
          form="stencil-metadata"
          value="ok"
          @click="${() => {
            const selectedIeds = this.iedsStencilMetadataUI?.selectedElements;
            const tagEdits = selectedIeds.flatMap(ied =>
              tagIedEdits(
                ied,
                this.stencilMetadataIdUI.value,
                this.stencilMetadataVerUI.value
              )
            );
            if (tagEdits.length > 0) {
              this.dispatchEvent(
                newEditEventV2(tagEdits, { title: 'Add stencil metadata' })
              );
            }

            const ieds = this.iedsStencilMetadataUI?.selectedElements;

            this.notify(`Metadata added to ${ieds.length} IED${
              ieds.length > 1 || ieds.length === 0 ? 's' : ''
            }`);
            this.requestUpdate();
          }}"
          >Add Metadata</oscd-text-button
        >
      </div></oscd-dialog
    >`;
  }

  private onApply(event: CustomEvent<StencilApplyDetail>): void {
    event.stopPropagation();
    const { edits, title } = event.detail;
    this.dispatchEvent(newEditEventV2(edits, { title }));
  }

  private onStencilChange(event: CustomEvent<StencilData>): void {
    event.stopPropagation();
    this.stencilData = event.detail;
    this.storeSettings();
  }

  private onTag(event: CustomEvent<Application | undefined>): void {
    event.stopPropagation();
    const tag = event.detail
      ? Object.values(event.detail.IEDS)[0]?.privates[0]
      : undefined;
    this.metadataIedItems = iedSelectItems(this.doc, true);
    this.iedStencilMetadataUI.show();
    if (tag) {
      this.stencilMetadataIdUI.value = tag['OpenSCD-Stencil-Id'];
      this.stencilMetadataVerUI.value = tag['OpenSCD-Stencil-Version'];
    }
  }

  private renderManage(): TemplateResult {
    return html`<oscd-stencil-manage
      .stencil=${this.stencilData}
      .library=${recentFirst(this.library)}
      .currentId=${this.currentId}
      @stencil-change=${this.onStencilChange}
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
    ></oscd-stencil-manage>`;
  }

  renderUse(): TemplateResult {
    return html`
      <div id="headline">
        <h1 id="stencilName">
          ${this.stencilData.name}<code id="stencilVersion"
            >${this.stencilData.version}</code
          >
        </h1>
        <div id="menuUse">
          ${this.library.length > 1
            ? html`<oscd-outlined-select
                id="recent"
                label=${msg('Stencil')}
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
            : nothing}
          <oscd-outlined-button
            id="changeStencilBtn"
            class="button"
            @click=${() => {
              this.changeStencilUI.click();
            }}
            >${msg('Open')}
            <oscd-icon slot="icon">file_open</oscd-icon>
          </oscd-outlined-button>
        </div>
      </div>
      <oscd-stencil-apply
        .doc=${this.doc}
        .stencil=${this.stencilData}
        @stencil-apply=${this.onApply}
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

  private renderCapture(): TemplateResult {
    return html`<oscd-stencil-capture
      .doc=${this.doc}
      .stencil=${this.stencilData}
      @stencil-capture=${this.onCapture}
      @stencil-tag=${this.onTag}
    ></oscd-stencil-capture>`;
  }

  renderOutputJSON(): TemplateResult {
    return html`<div class="output">
      <oscd-outlined-text-field
        id="outputView"
        type="textarea"
        label="Stencil Settings File"
        @change=${(event: Event) => {
          const target = event.target as OscdOutlinedTextField;
          if (target && this.useStencil(target.value, true)) {
            this.notify('Stencil settings updated', 'success');
          }
        }}
        value="${serializeStencil(this.stencilData)}"
        rows="20"
      >
      </oscd-outlined-text-field>
      <oscd-outlined-button
        class="button"
        @click=${() => this.saveStencilAsFile()}
        >Download
        <oscd-icon slot="icon">download</oscd-icon>
      </oscd-outlined-button>
    </div>`;
  }

  render(): TemplateResult {
    return html`<oscd-tabs
        .activeTabIndex=${this.tabIndex}
        @change=${(event: Event) => {
          this.tabIndex = (event.target as OscdTabs).activeTabIndex;
        }}
      >
        <oscd-primary-tab inline-icon>
          <oscd-icon slot="icon">play_circle</oscd-icon>${msg('Apply')}
        </oscd-primary-tab>
        <oscd-primary-tab inline-icon>
          <oscd-icon slot="icon">folder_managed</oscd-icon>${msg('Manage')}
        </oscd-primary-tab>
        <oscd-primary-tab inline-icon>
          <oscd-icon slot="icon">construction</oscd-icon>${msg('Create')}
        </oscd-primary-tab>
        <oscd-primary-tab inline-icon>
          <oscd-icon slot="icon">frame_source</oscd-icon>JSON
        </oscd-primary-tab>
      </oscd-tabs>
      <section>
        ${this.tabIndex === 0 ? this.renderUse() : nothing}
        ${this.tabIndex === 1 ? this.renderManage() : nothing}
        ${this.tabIndex === 2 ? this.renderCapture() : nothing}
        ${this.tabIndex === 3 ? this.renderOutputJSON() : nothing}
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
        color: var(--oscd-base00);
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

      #outputView {
        display: block;
        margin-top: 20px;
        max-height: 80vh;
        width: 100%;
        --md-outlined-text-field-input-text-font: var(--oscd-text-font-mono);
      }

      .button {
        margin: 10px;
      }
    `
  ];
}
