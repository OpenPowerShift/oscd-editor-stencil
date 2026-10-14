import {
  css,
  html,
  LitElement,
  nothing,
  PropertyValues,
  TemplateResult
} from 'lit';

import { property, query, queryAll, state } from 'lit/decorators.js';
import { ScopedElementsMixin } from '@open-wc/scoped-elements/lit-element.js';

import { OscdActionList } from '@omicronenergy/oscd-ui/action-list/OscdActionList.js';
import { OscdCheckbox } from '@omicronenergy/oscd-ui/checkbox/OscdCheckbox.js';
import { OscdDialog } from '@omicronenergy/oscd-ui/dialog/OscdDialog.js';
import { OscdFilledButton } from '@omicronenergy/oscd-ui/button/OscdFilledButton.js';
import { OscdIcon } from '@omicronenergy/oscd-ui/icon/OscdIcon.js';
import { OscdIconButton } from '@omicronenergy/oscd-ui/iconbutton/OscdIconButton.js';
import { OscdList } from '@omicronenergy/oscd-ui/list/OscdList.js';
import { OscdListItem } from '@omicronenergy/oscd-ui/list/OscdListItem.js';
import { OscdMenu } from '@omicronenergy/oscd-ui/menu/OscdMenu.js';
import { OscdMenuItem } from '@omicronenergy/oscd-ui/menu/OscdMenuItem.js';
import { OscdOutlinedButton } from '@omicronenergy/oscd-ui/button/OscdOutlinedButton.js';
import { OscdOutlinedTextField } from '@omicronenergy/oscd-ui/textfield/OscdOutlinedTextField.js';
import { OscdPrimaryTab } from '@omicronenergy/oscd-ui/tabs/OscdPrimaryTab.js';
import { OscdSelectionList } from '@omicronenergy/oscd-ui/selection-list/OscdSelectionList.js';
import { OscdSnackbar } from '@omicronenergy/oscd-ui/snackbar/OscdSnackbar.js';
import { OscdSwitch } from '@omicronenergy/oscd-ui/switch/OscdSwitch.js';
import { OscdTabs } from '@omicronenergy/oscd-ui/tabs/OscdTabs.js';
import { OscdTextButton } from '@omicronenergy/oscd-ui/button/OscdTextButton.js';
import type { SelectItem } from '@omicronenergy/oscd-ui/selection-list/OscdSelectionList.js';
import type { SnackbarVariant } from '@omicronenergy/oscd-ui/snackbar/OscdSnackbar.js';

import { newEditEventV2 } from '@openscd/oscd-api/utils.js';

import {
  ControlBlockInfo,
  getMappingInfo
} from './foundation/mapping-info.js';
import { combinations } from './foundation/combinations.js';
import { planApply } from './foundation/plan-apply.js';
import {
  defaultVersion,
  removeApplicationVersion,
  renameStencil,
  upsertApplicationVersion,
  visibleApplications
} from './foundation/stencil-model.js';
import {
  parseStencil,
  serializeStencil,
  stencilFileName
} from './foundation/stencil-io.js';
import {
  loadStoredStencil,
  newStencil,
  storeStencil
} from './foundation/storage.js';
import { tagIedEdits } from './foundation/ied-tags.js';
import type {
  Application,
  IedRequirement as IED,
  StencilData,
  VersionedApplications
} from './foundation/types.js';
import { getIedDescription } from './foundation/ied-description.js';
import { iedSelectItems } from './foundation/ied-items.js';
import { themeStyles } from './theme.js';

 
type ControlBlockTableMapping = {
  id: string;
  from: string;
  to: string;
};

type cbSelectionRowData = {
  fromIed: string;
  cbs: string[] | undefined;
};

type TableData = { toIedNames: string[]; rowInfo: cbSelectionRowData[] };

/**
 * A plugin to allow templates of GOOSE and SV using the
 * later binding method based on a JSON description of a configuration.
 */
export default class OscdEditorStencil extends ScopedElementsMixin(
  LitElement
) {
  static scopedElements = {
    'oscd-action-list': OscdActionList,
    'oscd-checkbox': OscdCheckbox,
    'oscd-dialog': OscdDialog,
    'oscd-filled-button': OscdFilledButton,
    'oscd-icon': OscdIcon,
    'oscd-icon-button': OscdIconButton,
    'oscd-list': OscdList,
    'oscd-list-item': OscdListItem,
    'oscd-menu': OscdMenu,
    'oscd-menu-item': OscdMenuItem,
    'oscd-outlined-button': OscdOutlinedButton,
    'oscd-outlined-text-field': OscdOutlinedTextField,
    'oscd-primary-tab': OscdPrimaryTab,
    'oscd-selection-list': OscdSelectionList,
    'oscd-snackbar': OscdSnackbar,
    'oscd-switch': OscdSwitch,
    'oscd-tabs': OscdTabs,
    'oscd-text-button': OscdTextButton
  };

  @property({ attribute: false })
  doc!: XMLDocument;

  @property() docName!: string;

  @property({ attribute: false }) docVersion?: unknown;

  @property() tabIndex: number = 0;

  @property() iedMappingStencilData: ControlBlockInfo[] = [];

  @property() uniqueIeds: string[] = [];

  @property() stencilData: StencilData = newStencil();

  @property() selectedApplication: VersionedApplications | null = null;

  @property() selectedAppVersion: Application | undefined = undefined;

  @property() applicationSelectedIed: Element | null = null;

  @property() applicationSelectedFunction: string | null = null;

  @property() applicationSelectedFunctionReqs: IED | null = null;

  @property() functionToIed: Map<string, string> = new Map();

  @property() showDeprecated: boolean = false;

  @property() templateCreationStage: number = 0;

  @property() createCBsToRemove: ControlBlockTableMapping[] = [];

  @property() errorMessages: string[] = [];

  @property() showSupervisions: boolean = true;

  /** Entries of the IED pickers, built when a dialog opens (see iedSelectItems). */
  @state() templateIedItems: SelectItem[] = [];

  @state() metadataIedItems: SelectItem[] = [];

  @property() allowEditColumns: boolean = false;

  @property() allowAppCreationToggles: boolean = true;

  @query('oscd-tabs') tabBarUI!: OscdTabs;

  @query('#output') outputStencilUI!: OscdOutlinedTextField;

  @query('#outputView') outputStencilViewUI!: OscdOutlinedTextField;

  @query('#stenname') stencilName!: OscdOutlinedTextField;

  @query('#stenver') stencilVersion!: OscdOutlinedTextField;

  @query('#appcat') appCategory!: OscdOutlinedTextField;

  @query('#appname') appName!: OscdOutlinedTextField;

  @query('#appdesc') appDesc!: OscdOutlinedTextField;

  @query('#appver') appVer!: OscdOutlinedTextField;

  @query('#appverdesc') appVerDesc!: OscdOutlinedTextField;

  @query('#appdeprecated') appDeprecated!: OscdCheckbox;

  @query('#selection-dialog') iedTemplateSelectorUI!: OscdDialog;

  @query('#ied-function-selector-dialog') iedSelectorUI!: OscdDialog;

  @query('#ied-stencil-metadata') iedStencilMetadataUI!: OscdDialog;

  @query('#stencil-metadata-ieds') iedsStencilMetadataUI!: OscdSelectionList;

  @query('#stencil-id') stencilMetadataIdUI!: OscdOutlinedTextField;

  @query('#stencil-ver') stencilMetadataVerUI!: OscdOutlinedTextField;

  @query('#selection-list') selectionListUI!: OscdSelectionList;

  @query('#changeStencil') changeStencilUI!: HTMLInputElement;

  @query('#menuApplicationsButton') menuAppButtonUI!: OscdIconButton;

  @query('#menuApplications') menuAppUI!: OscdMenu;

  @query('#cbMappings') cbMappingsTableUI: HTMLTableElement | undefined;

  @query('#cbMappings #tableUserMappingSelection') tableUserMappingSelectionUI:
    | HTMLElement
    | undefined;

  @queryAll('#cbMappings > thead > th > oscd-checkbox.colselect.iedname')
  tableUserMappingSelectionToIedsUI: HTMLElement[] | undefined;

  @queryAll(
    '#tableUserMappingSelection > tr > th.iedname > oscd-checkbox.rowselect.iedname'
  )
  tableUserMappingSelectionFromIedsUI: HTMLElement[] | undefined;

  @queryAll(
    '#tableUserMappingSelection > tr > th.cbname > oscd-checkbox.rowselect.cbname'
  )
  tableUserMappingSelectionFromCbsUI: HTMLElement[] | undefined;

  @queryAll('#tableUserMappingSelection td.mapcell > oscd-checkbox.cb')
  tableUserMappingMappedCheckboxesUI: HTMLElement[] | undefined;

  @queryAll('#function > oscd-outlined-text-field')
  functionIedNamesUI!: OscdOutlinedTextField[];

  @query('#snackBarMessage') snackBarMessageUI!: OscdSnackbar;

  @query('#error-dialog') errorDialogUI!: OscdDialog;

  /** Shows a message in the snackbar. */
  notify(message: string, variant: SnackbarVariant = 'info'): void {
    this.snackBarMessageUI.show({ message, variant });
  }

  addApplication(): void {
    // need to do some validation
    this.templateCreationStage = 3;
    const iedNameMapping = new Map<string, string>();
    this.functionIedNamesUI.forEach(textField =>
      iedNameMapping.set(textField.dataset.ied!, textField.value.trim())
    );

    const ieds = new Map<string, IED>();
    this.uniqueIeds.forEach((iedName) => {
      const ied = this.doc.querySelector(`IED[name="${iedName}"]`)!;
      ieds.set(iedNameMapping.get(iedName) ?? 'Unknown IED', {
        originalName: ied.getAttribute('name')!,
        type: ied.getAttribute('type')!,
        manufacturer: ied.getAttribute('manufacturer')!,
        privates: [
          {
            'OpenSCD-Stencil-Id':
              ied.querySelector(':scope > Private[type="OpenSCD-Stencil-Id"]')
                ?.textContent ?? 'No Stencil Id Found',
            'OpenSCD-Stencil-Version':
              ied.querySelector(
                ':scope > Private[type="OpenSCD-Stencil-Version"]'
              )?.textContent ?? 'No Stencil Version Found'
          }
        ]
      });
    });

    const category = this.appCategory.value.trim();
    const name = this.appName.value.trim();

    this.stencilData = upsertApplicationVersion(
      renameStencil(
        this.stencilData,
        this.stencilName.value.trim(),
        this.stencilVersion.value.trim()
      ),
      { category, name, description: this.appDesc.value.trim() },
      {
        version: this.appVer.value.trim(),
        description: this.appVerDesc.value.trim(),
        deprecated: this.appDeprecated.checked,
        IEDS: Object.fromEntries(ieds),
        ControlBlocks: this.iedMappingStencilData.map(cb => ({
          ...cb,
          from: iedNameMapping.get(cb.from)!,
          to: iedNameMapping.get(cb.to)!
        }))
      }
    );

    this.storeSettings();

    this.notify(`New application created: ${category} > ${name}`);
    this.resetCreateApplication();
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

    this.clearStencilCreateData();
  }

  clearStencilCreateData(): void {
    this.uniqueIeds = [];
    this.iedMappingStencilData = [];
  }

  clearIedTemplateSelection(): void {
    this.templateIedItems = iedSelectItems(this.doc);
    if (this.selectionListUI) {
      this.selectionListUI.searchValue = '';
    }
  }

  /** Replaces the stencil with a validated one. @returns whether it was valid. */
  protected useStencil(json: string): boolean {
    const { stencil, errors } = parseStencil(json);
    if (!stencil) {
      this.notify(errors.join('. '), 'error');
      return false;
    }

    this.stencilData = stencil;
    this.storeSettings();
    this.selectedApplication = null;
    this.selectedAppVersion = undefined;
    this.resetApplyStencil();
    return true;
  }

  async loadStencil(event: Event): Promise<void> {
    const file = (<HTMLInputElement | null>event.target)?.files?.item(0);
    if (!file) {
      return;
    }

    this.useStencil(await file.text());
  }

  applyStencil(): void {
    if (!this.selectedAppVersion) {
      return;
    }

    const plan = planApply(
      this.doc,
      this.selectedAppVersion,
      this.functionToIed
    );

    if (plan.edits.length > 0) {
      this.dispatchEvent(
        newEditEventV2(plan.edits, {
          title: `Apply stencil ${this.selectedApplication?.name ?? ''} ${
            this.selectedAppVersion.version
          }`.trim()
        })
      );
    }

    this.errorMessages = plan.errors;
    if (this.errorMessages.length > 0) {
      this.errorDialogUI.show();
    }

    this.notify(
      `${plan.subscriptions} subscriptions and ${plan.supervisions} supervisions done`,
      plan.errors.length > 0 ? 'warning' : 'success'
    );
    this.resetApplyStencil();
  }

  resetCreateApplication(): void {
    this.templateCreationStage = 0;
    this.iedMappingStencilData = [];
    this.uniqueIeds = [];
    this.createCBsToRemove = [];
    this.allowAppCreationToggles = true;
  }

  resetApplyStencil(): void {
    this.functionToIed = new Map<string, string>();
  }

  connectedCallback(): void {
    super.connectedCallback();
    // restore settings from local storage on plugin loading
    this.restoreSettings();
  }

  /**
   * Restore settings from local storage, applying appropriate defaults
   * if not set or unreadable.
   */
  protected restoreSettings(): void {
    this.stencilData = loadStoredStencil();
  }

  protected storeSettings(): void {
    storeStencil(this.stencilData);
  }

  protected updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties);

    // update local storage for stored plugin settings
    const storageUpdateRequired = Array.from(changedProperties.keys()).some(
      prop => prop === 'stencilData'
    );
    if (storageUpdateRequired) {
      this.storeSettings();
    }

    // reset application if switching to create tab
    if (Array.from(changedProperties.keys()).includes('tabIndex')) {
      this.resetCreateApplication();
    }

    if (Array.from(changedProperties.keys()).includes('allowEditColumns')) {
      const { toIedNames, rowInfo } = this.getTableData();
      if (this.allowEditColumns) {
        this.requestUpdate();
        this.updateDependentCheckboxes('map', toIedNames, rowInfo);
      }
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

  renderFunctionIedSelector(): TemplateResult {
    const func = this.applicationSelectedFunction
      ? this.selectedAppVersion?.IEDS[this.applicationSelectedFunction]
      : null;

    const items = Array.from(this.doc?.querySelectorAll(':root > IED') ?? []).filter(
      ied =>
        ied.getAttribute('type') === (func ? func.type : '') &&
        ied.getAttribute('manufacturer') === (func ? func.manufacturer : '')
    );
    return html`<oscd-dialog
      id="ied-function-selector-dialog"
      @close=${() => {
        const fn = this.applicationSelectedFunction;
        if (fn && this.applicationSelectedIed) {
          this.functionToIed = new Map(this.functionToIed).set(
            fn,
            this.applicationSelectedIed.getAttribute('name')!
          );
        }
        if (fn && this.iedSelectorUI.returnValue === 'reset') {
          const next = new Map(this.functionToIed);
          next.delete(fn);
          this.functionToIed = next;
        }
        this.applicationSelectedFunction = null;
        this.applicationSelectedIed = null;
        this.applicationSelectedFunctionReqs = null;
      }}
      @cancel=${(event: Event) => {
        event.preventDefault();
      }}
    >
      <div slot="headline">
        Select IED for function - ${this.applicationSelectedFunction ?? ''}
      </div>
      <form slot="content" id="ied-selection" method="dialog">
        <oscd-action-list
          id="action-list"
          filterable
          .items=${items              .filter((ied) => {
            const id = ied.querySelector(
              ':scope > Private[type="OpenSCD-Stencil-Id"]'
            )?.textContent;
            const version = ied.querySelector(
              ':scope > Private[type="OpenSCD-Stencil-Version"]'
            )?.textContent;
            return (
              !func ||
                    func.privates.some(
                      priv =>
                        priv['OpenSCD-Stencil-Id'] === id &&
                        priv['OpenSCD-Stencil-Version'] === version
                    )
            );
          })
            .filter(
              ied =>
                !Array.from(this.functionToIed.values()).includes(
                  ied.getAttribute('name')!
                )
            )
            .map((ied) => {
              const { firstLine, secondLine } = getIedDescription(ied);

              return {
                headline: `${ied.getAttribute('name')!} — ${firstLine}`,
                supportingText: secondLine,
                attachedElement: ied,
                primaryAction: () => {
                  this.applicationSelectedIed = ied;
                  this.iedSelectorUI.returnValue = 'ok';
                  this.iedSelectorUI.close();
                }
              };
            })}
        ></oscd-action-list>
      </form>
      <div slot="actions">
        <oscd-text-button
          form="ied-selection"
          value="reset"
          @click="${() => {
            this.iedSelectorUI.returnValue = 'reset';
            this.iedSelectorUI.close();
          }}"
          >Reset</oscd-text-button
        >
      </div></oscd-dialog
    >`;
  }

  renderIedsForUse(): TemplateResult {
    return html`${
      this.selectedApplication && this.selectedAppVersion
        ? html`<div id="appContainer">
            <h2>Select IEDs for Function</h2>
            <oscd-list id="iedsAndFunctions" class="scrollable">
              ${Object.keys(this.selectedAppVersion.IEDS)
                .sort((iedA, iedB) =>
                  iedA.toLowerCase().localeCompare(iedB.toLowerCase())
                )
                .map((iedFunction) => {
                  const ied = this.selectedAppVersion!.IEDS[iedFunction];

                  return html`
                    <oscd-list-item
                      type="button"
                      title="${ied.privates
                        .map(
                          priv =>
                            `${priv['OpenSCD-Stencil-Id']} - ${priv['OpenSCD-Stencil-Version']}`
                        )
                        .join(`, `)}"
                      @click=${() => {
                        this.applicationSelectedFunction = iedFunction;
                        this.applicationSelectedFunctionReqs = ied;
                        // = (<HTMLElement>event.target).closest('oscd-list-item')

                        this.iedSelectorUI.show();
                      }}
                    >
                      <div slot="headline">
                        ${iedFunction}${this.functionToIed.get(iedFunction)
                          ? `  ⮕  ${this.functionToIed.get(iedFunction)}`
                          : nothing}
                      </div>
                      <div slot="supporting-text">
                        ${ied.manufacturer} - ${ied.type}
                      </div>
                      <oscd-icon slot="start">developer_board</oscd-icon>
                      <oscd-icon slot="end"
                        >${this.functionToIed.get(iedFunction) !== undefined
                          ? 'check_box'
                          : 'check_box_outline_blank'}</oscd-icon
                      >
                    </oscd-list-item>
                  `;
                })}
            </oscd-list>
            <oscd-outlined-button
              class="button"
              ?disabled=${this.functionToIed.size === 0}
              @click=${() => {
                this.resetApplyStencil();
              }}
              >Clear IEDs
              <oscd-icon slot="icon">cancel</oscd-icon>
            </oscd-outlined-button>
            <oscd-filled-button
              class="button"
              ?disabled=${this.functionToIed.size === 0}
              @click=${() => this.applyStencil()}
              >Apply Stencil
              <oscd-icon slot="icon">draw_collage</oscd-icon>
            </oscd-filled-button>
          </div> `
        : nothing
    }
  </div>`;
  }

  renderApplicationDetails(): TemplateResult {
    if (!this.selectedAppVersion) {
      return html``;
    }

    const toIedNames = this.selectedAppVersion!.ControlBlocks.map(cb => cb.to)
      .filter((item, i, ar) => ar.indexOf(item) === i)
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    const rowIedNames = this.selectedAppVersion!.ControlBlocks.map(
      cb => cb.from
    )
      .filter((item, i, ar) => ar.indexOf(item) === i)
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    const iedFromWithCBs = new Map<string, string[]>();
    rowIedNames.forEach((ied) => {
      iedFromWithCBs.set(ied, [
        ...new Set(
          this.selectedAppVersion!.ControlBlocks.filter(
            cb => cb.from === ied
          ).map(cb => cb.id)
        )
      ]);
    });

    const rowInfo = rowIedNames.flatMap(iedName => ({
      fromIed: iedName,
      cbs: iedFromWithCBs.get(iedName)
    }));

    return html`<div id="controlBlockMappings" class="columngroup">
      <h2>Application Details</h2>
      <label
        ><oscd-switch
          touch-target="wrapper"
          ?selected=${true}
          ?disabled=${!this.allowAppCreationToggles}
          @change=${() => {
            this.showSupervisions = !this.showSupervisions;
          }}
        ></oscd-switch
        >Show Supervisions</label
      >
      ${this.renderCbSelectionTable(
        toIedNames,
        rowInfo,
        this.selectedAppVersion!.ControlBlocks,
        true
      )}
    </div>`;
  }

  private isSelected(app: VersionedApplications): boolean {
    return (
      this.selectedApplication?.category === app.category &&
      this.selectedApplication?.name === app.name
    );
  }

  selectApplication(app: VersionedApplications): void {
    this.selectedApplication = app;
    this.selectedAppVersion = defaultVersion(app, this.showDeprecated);
    this.resetApplyStencil();
  }

  toggleDeprecated(): void {
    this.showDeprecated = !this.showDeprecated;

    const stillVisible = visibleApplications(
      this.stencilData,
      this.showDeprecated
    ).some(app => this.selectedApplication && this.isSelected(app));
    if (!stillVisible) {
      this.selectedApplication = null;
      this.selectedAppVersion = undefined;
      this.resetApplyStencil();
    }
  }

  /** Removes the selected version, and its application if it was the last. */
  deleteSelectedVersion(): void {
    if (!this.selectedApplication || !this.selectedAppVersion) {
      return;
    }

    this.stencilData = removeApplicationVersion(
      this.stencilData,
      this.selectedApplication,
      this.selectedAppVersion.version
    );
    this.storeSettings();
    this.selectedApplication = null;
    this.selectedAppVersion = undefined;
    this.resetApplyStencil();
  }

  renderApplicationList(): TemplateResult[] {
    const applications = visibleApplications(
      this.stencilData,
      this.showDeprecated
    );
    const lower = (text: string): string => text.toLowerCase();

    return applications
      .map(app => app.category)
      .filter((category, i, all) => all.indexOf(category) === i)
      .sort((a, b) => lower(a).localeCompare(lower(b)))
      .map(
        category => html`<oscd-list-item data-cat="${category}">
            <div slot="headline">${category}</div>
            <oscd-icon slot="start">ad_group</oscd-icon>
          </oscd-list-item>
          ${applications
            .filter(app => app.category === category)
            .sort((a, b) => lower(a.name).localeCompare(lower(b.name)))
            .map((app) => {
              const version = defaultVersion(app, this.showDeprecated);

              return html`<oscd-list-item
                class="${this.isSelected(app) ? 'selected' : ''}"
                @click=${() => this.selectApplication(app)}
                type="button"
                data-cat="${category}"
                data-name="${app.name}"
              >
                <div slot="headline">${app.name}</div>
                <div slot="supporting-text">
                  ${app.description}${version?.description
                    ? ` - ${version.description}`
                    : ''}
                </div>
                <div slot="trailing-supporting-text">
                  ${version
                    ? `${version.version}${version.deprecated ? ' (deprecated)' : ''}`
                    : 'No available version'}
                </div>
                <oscd-icon slot="start">draw_collage</oscd-icon>
              </oscd-list-item>`;
            })}`
      );
  }

  renderStencilSelectionAndUse(): TemplateResult {
    if (this.stencilData.applications.length === 0) {
      return html`<p>No applications exist in the current stencil.</p>`;
    }

    return html`<section id="appSelection">
        <div id="appMaker">
          <div>
            <h2 id="appMenuHeader">
              Select Application
              <oscd-icon-button
                id="menuApplicationsButton"
                @click=${() => {
                  this.menuAppUI.open = !this.menuAppUI.open;
                }}
                ><oscd-icon>more_vert</oscd-icon></oscd-icon-button
              >
              <oscd-menu
                positioning="popover"
                id="menuApplications"
                anchor="menuApplicationsButton"
              >
                <oscd-menu-item
                  @click=${() => this.toggleDeprecated()}
                >
                  <div slot="headline">
                    <label class="menu-item">
                      <oscd-checkbox
                        touch-target="wrapper"
                        ?checked=${this.showDeprecated}
                      ></oscd-checkbox>
                      Show Deprecated
                    </label>
                  </div>
                </oscd-menu-item>
              </oscd-menu>
            </h2>
            <oscd-list id="applications" class="scrollable"
              >${this.renderApplicationList()}</oscd-list
            >
            <oscd-outlined-button
              class="button"
              ?disabled=${!this.selectedAppVersion}
              @click=${() => this.deleteSelectedVersion()}
              >Delete Application
              <oscd-icon slot="icon">delete</oscd-icon>
            </oscd-outlined-button>
          </div>
          ${this.renderIedsForUse()}
        </div>
      </section>
      <section>${this.renderApplicationDetails()}</section>`;
  }

  renderUse(): TemplateResult {
    if (!this.doc) {
      return html`<h1>Please open a file to use this functionality</h1>`;
    }

    return html`
      <div id="headline">
        <h1 id="stencilName">
          ${this.stencilData.name}<code id="stencilVersion"
            >${this.stencilData.version}</code
          >
        </h1>
        <div id="menuUse">
          <oscd-outlined-button
            id="changeStencilBtn"
            class="button"
            @click=${() => {
              this.changeStencilUI.click();
            }}
            >Open
            <oscd-icon slot="icon">file_open</oscd-icon>
          </oscd-outlined-button>
          <oscd-outlined-button
            id="saveStencilBtn"
            class="button"
            @click=${() => {
              this.saveStencilAsFile();
            }}
            >Save
            <oscd-icon slot="icon">save</oscd-icon>
          </oscd-outlined-button>
        </div>
      </div>
      ${this.renderStencilSelectionAndUse()}
      <input
        id="changeStencil"
        @click=${({ target }: MouseEvent) => {
           
          (<HTMLInputElement>target).value = '';
        }}
        @change=${this.loadStencil}
        type="file"
        accept=".json"
      />
    `;
  }

  renderRowCbUsed(
    cbName: string,
    row: cbSelectionRowData,
    toIedNames: string[],
    rowInfo: cbSelectionRowData[],
    mappingData: ControlBlockInfo[],
    readOnly?: boolean
  ) {
    return html`${toIedNames.map((toIed) => {
      const mappedCb = mappingData.find(
        cb => cb.id === cbName && cb.from === row.fromIed && cb.to === toIed
      );

      const selSupervisionMapping = mappedCb?.selSupervision;

      return html`<td
        class="${mappedCb ? 'mapcell' : ''} ${row.fromIed === toIed
          ? 'diagonal'
          : ''}"
      >
        ${mappedCb && !readOnly
          ? html`<oscd-checkbox
              class="cb ${mappedCb && mappedCb.type === 'SampledValueControl'
                ? 'sv'
                : ''}"
              data-fromIed="${row.fromIed}"
              data-fromCb="${cbName}"
              data-toIed="${toIed}"
              touch-target="wrapper"
              ?checked=${true}
              @change=${() => {
                this.updateDependentCheckboxes(
                  'map',
                  toIedNames,
                  rowInfo,
                  toIed,
                  row.fromIed
                );
              }}
            ></oscd-checkbox> `
          : nothing}
        ${mappedCb &&
        !this.createCBsToRemove.find(
          cb => cb.id === cbName && cb.from === row.fromIed && cb.to === toIed!
        ) &&
        readOnly
          ? html`<oscd-icon
              class="cb ${mappedCb && mappedCb.type === 'SampledValueControl'
                ? 'sv'
                : ''}"
              >check</oscd-icon
            >`
          : nothing}
        <!-- supervision -->
        ${mappedCb && this.showSupervisions
          ? html`<p id="supervisionInfo">
              ${mappedCb.supervision === 'None'
                ? 'None'
                : mappedCb.supervision.substring(2)}
            </p>`
          : nothing}
        <!-- SEL supervision -->
        ${mappedCb && selSupervisionMapping && this.showSupervisions
          ? html`<p id="supervisionInfoSEL">
              ${selSupervisionMapping ? selSupervisionMapping.name : nothing}
            </p>`
          : nothing}
      </td>`;
    })}`;
  }

  renderCbSelectionTableRows(
    toIedNames: string[],
    rowInfo: cbSelectionRowData[],
    mappingData: ControlBlockInfo[],
    readOnly?: boolean
  ): TemplateResult {
    return html`${rowInfo.map(
      row =>
        html`<tr>
            <th
              scope="row"
              class="iedname iednamebg removerightborder indentied"
            >
              ${row.fromIed}
            </th>
            <th class="iedname iednamebg removeleftborder">
              ${this.allowEditColumns
                ? html`<oscd-checkbox
                    class="rowselect iedname"
                    data-fromIed="${row.fromIed}"
                    touch-target="wrapper"
                    ?checked=${true}
                    @change=${(event: { target: OscdCheckbox }) => {
                      this.tableUserMappingSelectionUI
                        ?.querySelectorAll(
                          `td.mapcell > oscd-checkbox[data-fromied="${row.fromIed}"]`
                        )
                        .forEach((checkbox) => {
                           
                          (<OscdCheckbox>checkbox).checked = event.target.checked;
                        });

                      this.updateDependentCheckboxes(
                        'from',
                        toIedNames,
                        rowInfo,
                        undefined,
                        row.fromIed
                      );
                    }}
                  ></oscd-checkbox>`
                : nothing}
            </th>
            <td class="iednamebg" colspan="${toIedNames.length}"></td>
          </tr>
          ${row
            .cbs!.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
            .map(
              cbName =>
                html`<tr>
                  <th
                    scope="row"
                    class="cbname removerightborder indentcb"
                    data-fromIed="${row.fromIed}"
                    data-fromCb="${cbName}"
                  >
                    ${cbName.substring(2)}
                  </th>
                  <th class="removeleftborder cbname">
                    ${this.allowEditColumns
                      ? html`<oscd-checkbox
                          class="rowselect cbname"
                          data-fromIed="${row.fromIed}"
                          data-fromCb="${cbName}"
                          touch-target="wrapper"
                          ?checked=${true}
                          @change=${(event: { target: OscdCheckbox }) => {
                            this.tableUserMappingSelectionUI
                              ?.querySelectorAll(
                                `td.mapcell > oscd-checkbox[data-fromied="${row.fromIed}"][data-fromcb="${cbName}"]`
                              )
                              .forEach(
                                 
                                (checkbox) => {
                                   
                                  (checkbox as OscdCheckbox).checked =
                                    event.target.checked;
                                }
                              );

                            this.updateDependentCheckboxes(
                              'cb',
                              toIedNames,
                              rowInfo
                            );
                          }}
                        ></oscd-checkbox>`
                      : nothing}
                  </th>
                  ${this.renderRowCbUsed(
                    cbName,
                    row,
                    toIedNames,
                    rowInfo,
                    mappingData,
                    readOnly
                  )}
                </tr>`
            )}`
    )}`;
  }

  updateDependentCheckboxes(
    source: 'to' | 'cb' | 'from' | 'map',
    toIedNames: string[],
    fromIedNamesAndCBs: cbSelectionRowData[],
    toIedName?: string,
    fromIedName?: string,
    cbName?: string
  ): void {
    if (!this.allowEditColumns) {
      return;
    }

    const updateCheckbox = (checkbox: OscdCheckbox, selector: string) => {
      if (checkbox) {
        const rowIedsChecked = Array.from(
          this.tableUserMappingSelectionUI!.querySelectorAll(selector)
        ).filter(cb => (cb as OscdCheckbox).checked).length;

        const rowIedsTotal =
          this.tableUserMappingSelectionUI?.querySelectorAll(selector).length;

         
        checkbox.checked = rowIedsTotal === rowIedsChecked;
         
        checkbox.indeterminate =
          rowIedsTotal !== rowIedsChecked && rowIedsChecked !== 0;
      }
    };

    if (source !== 'to') {
      const checkbox = this.cbMappingsTableUI?.querySelector(
        `:scope > thead > tr > th > oscd-checkbox.colselect.iedname[data-toied="${toIedName}"]`
      ) as OscdCheckbox;
      const selector = `td.mapcell > oscd-checkbox[data-toied="${toIedName}"]`;
      updateCheckbox(checkbox, selector);

      // not a specific IED, update all
      if (!toIedName) {
        toIedNames.forEach((iedName) => {
          const checkbox = this.cbMappingsTableUI?.querySelector(
            `:scope > thead > tr > th > oscd-checkbox.colselect.iedname[data-toied="${iedName}"]`
          ) as OscdCheckbox;
          const selector = `td.mapcell > oscd-checkbox[data-toied="${iedName}"]`;
          updateCheckbox(checkbox, selector);
          // console.log(`Updated a to ied ${iedName}`);
        });
      }
    }

    if (source !== 'from') {
      const checkbox = this.cbMappingsTableUI?.querySelector(
        `:scope > tbody > tr > th.iedname > oscd-checkbox.rowselect.iedname[data-fromied="${fromIedName}"]`
      ) as OscdCheckbox;
      const selector = `td.mapcell > oscd-checkbox[data-fromied="${fromIedName}"]`;
      updateCheckbox(checkbox, selector);

      // update for all from-IEDs
      if (!fromIedName) {
        fromIedNamesAndCBs.forEach((ied) => {
          const checkbox = this.cbMappingsTableUI?.querySelector(
            `:scope > tbody > tr > th.iedname > oscd-checkbox.rowselect.iedname[data-fromied="${ied.fromIed}"]`
          ) as OscdCheckbox;
          const selector = `td.mapcell > oscd-checkbox[data-fromied="${ied.fromIed}"]`;
          updateCheckbox(checkbox, selector);
          // console.log(`Updated a from ied ${ied.fromIed}`);
        });
      }
    }

    if (source !== 'cb') {
      const checkbox = this.cbMappingsTableUI?.querySelector(
        `:scope > tbody > tr > th.cbname > oscd-checkbox.rowselect.cbname[data-fromied="${fromIedName}"][data-fromcb="${cbName}"]`
      ) as OscdCheckbox;
      const selector = `td.mapcell > oscd-checkbox[data-fromied="${fromIedName}"][data-fromcb="${cbName}"]`;
      updateCheckbox(checkbox, selector);

      if (!fromIedName && !cbName) {
        // update for all IEDs and control blocks
        fromIedNamesAndCBs.forEach((ied) => {
          ied.cbs?.forEach((cb) => {
            const checkbox = this.cbMappingsTableUI?.querySelector(
              `:scope > tbody > tr > th.cbname > oscd-checkbox.rowselect.cbname[data-fromied="${ied.fromIed}"][data-fromcb="${cb}"]`
            ) as OscdCheckbox;
            const selector = `td.mapcell > oscd-checkbox[data-fromied="${ied.fromIed}"][data-fromcb="${cb}"]`;
            updateCheckbox(checkbox, selector);
            // console.log(`Updated an all ieds and cb ${ied.fromIed} ${cb}`);
          });
        });
      } else if (fromIedName && !cbName) {
        // update for all control blocks for a specific IED
        const fromData = fromIedNamesAndCBs.find(
          data => data.fromIed === fromIedName
        );
        fromData?.cbs?.forEach((cb) => {
          const checkbox = this.cbMappingsTableUI?.querySelector(
            `:scope > tbody > tr > th.cbname > oscd-checkbox.rowselect.cbname[data-fromied="${fromIedName}"][data-fromcb="${cb}"]`
          ) as OscdCheckbox;
          const selector = `td.mapcell > oscd-checkbox[data-fromied="${fromIedName}"][data-fromcb="${cb}"]`;
          updateCheckbox(checkbox, selector);
          // console.log(`Updated a cb ${fromIedName} ${cb}`);
        });
      }
    }
  }

  getTableData(): TableData {
    const toIedNames = this.iedMappingStencilData
      .map(cb => cb.to)
      .filter((item, i, ar) => ar.indexOf(item) === i)
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    const rowIedNames = this.iedMappingStencilData
      .map(cb => cb.from)
      .filter((item, i, ar) => ar.indexOf(item) === i)
      .sort();

    const iedFromWithCBs = new Map<string, string[]>();
    rowIedNames.forEach((ied) => {
      iedFromWithCBs.set(ied, [
        ...new Set(
          this.iedMappingStencilData
            .filter(cb => cb.from === ied)
            .map(cb => cb.id)
        )
      ]);
    });

    const rowInfo: cbSelectionRowData[] = rowIedNames.flatMap(iedName => ({
      fromIed: iedName,
      cbs: iedFromWithCBs.get(iedName)
    }));

    return { toIedNames, rowInfo };
  }

  renderCbSelectionTable(
    toIedNames: string[],
    rowInfo: cbSelectionRowData[],
    mappingData: ControlBlockInfo[],
    readOnly?: boolean
  ): TemplateResult {
    return html`<table id="cbMappings">
      <caption>
        Control Block Mappings
      </caption>
      <thead>
        <tr>
          <th scope="col" colspan="2"></th>
          <th scope="col" colspan="${toIedNames.length}">To</th>
        </tr>
        <tr>
          <th scope="col" colspan="2">From</th>
          ${toIedNames.map(
            iedName =>
              html`<th class="stay" scope="col">
                ${iedName}
                ${this.allowEditColumns
                  ? html`<oscd-checkbox
                      class="colselect iedname"
                      data-toIed="${iedName}"
                      touch-target="wrapper"
                      checked
                      @change=${(event: { target: OscdCheckbox }) => {
                        this.tableUserMappingSelectionUI
                          ?.querySelectorAll(
                            `td.mapcell > oscd-checkbox[data-toied="${iedName}"]`
                          )
                          .forEach(
                             
                            checkBox =>
                               
                              ((checkBox as OscdCheckbox).checked =
                                event.target.checked)
                          );

                        this.updateDependentCheckboxes(
                          'to',
                          toIedNames,
                          rowInfo
                        );
                      }}
                      }
                    ></oscd-checkbox>`
                  : nothing}
              </th>`
          )}
        </tr>
      </thead>
      <tbody id="tableUserMappingSelection">
        ${this.renderCbSelectionTableRows(
          toIedNames,
          rowInfo,
          mappingData,
          readOnly
        )}
      </tbody>
    </table>`;
  }

  renderCbSelection(): TemplateResult {
    const { toIedNames, rowInfo } = this.getTableData();
    const readOnly = this.templateCreationStage >= 2;

    return html`<h1>Select Template Control Blocks</h1>
      <div class="group">
        <label
          ><oscd-switch
            touch-target="wrapper"
            ?selected=${true}
            ?disabled=${!this.allowAppCreationToggles}
            @change=${() => {
              this.showSupervisions = !this.showSupervisions;
            }}
          ></oscd-switch
          >Show Supervisions</label
        >
        <label
          ><oscd-switch
            touch-target="wrapper"
            ?selected=${false}
            ?disabled=${!this.allowAppCreationToggles}
            @change=${() => {
              this.allowEditColumns = !this.allowEditColumns;
            }}
          ></oscd-switch
          >Allow From/To Selection</label
        >
      </div>
      <div class="columngroup">
        ${toIedNames.length === 0
          ? html`<h3>No mappings found between devices</h3>`
          : this.renderCbSelectionTable(
            toIedNames,
            rowInfo,
            this.iedMappingStencilData,
            readOnly
          )}
      </div>
      <oscd-filled-button
        class="button"
        ?disabled=${this.iedMappingStencilData.length === 0}
        @click=${() => {
          this.createCBsToRemove = [
            ...this.createCBsToRemove,
            ...Array.from(this.tableUserMappingMappedCheckboxesUI!).flatMap(
              (checkbox) => {
                const { fromied, fromcb, toied } = (<OscdCheckbox>checkbox)
                  .dataset;
                return (<OscdCheckbox>checkbox).checked
                  ? []
                  : [{ id: fromcb!, from: fromied!, to: toied! }];
              }
            )
          ];

          // No longer acceptable to edit columns at this stage of the process
          this.allowEditColumns = false;
          this.allowAppCreationToggles = false;

          this.templateCreationStage = 2;

          // remove unused control blocks
          this.iedMappingStencilData = this.iedMappingStencilData.filter(
            cbInf =>
              !this.createCBsToRemove.find(
                cb =>
                  cb.id === cbInf.id &&
                  cb.from === cbInf.from &&
                  cb.to === cbInf.to
              )
          );

          // now generate list of remaining IEDs for naming
          this.uniqueIeds = this.iedMappingStencilData
            .flatMap(val => [val.to, val.from])
            .filter((name, i, names) => names.indexOf(name) === i);
        }}
        >Name IEDs for Functions
        <oscd-icon slot="icon">draw_collage</oscd-icon>
      </oscd-filled-button>`;
  }

  renderIedsToFunctionNaming(): TemplateResult {
    return html`<h1>Name IEDs with Functions</h1>
      <div class="group appinf" id="function">
        ${this.uniqueIeds
          .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
          .map(
            ied =>
              html`<oscd-outlined-text-field
                class="iedfunction"
                data-ied="${ied}"
                label="IED Function (was ${ied})"
                value="${ied}"
              ></oscd-outlined-text-field>`
          )}
      </div>
      <oscd-filled-button
        class="button"
        ?disabled=${this.uniqueIeds.length === 0}
        @click=${() => this.addApplication()}
        >Add Application
        <oscd-icon slot="icon">draw_collage</oscd-icon>
      </oscd-filled-button>`;
  }

  renderOutputJSON(): TemplateResult {
    return html`<div class="output">
      <oscd-outlined-text-field
        id="outputView"
        type="textarea"
        label="Stencil Settings File"
        @change=${(event: Event) => {
          const target = event.target as OscdOutlinedTextField;
          if (target && this.useStencil(target.value)) {
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

  renderCreate(): TemplateResult {
    if (!this.doc) {
      return html`<h1>Please open a file to use this functionality</h1>`;
    }

    return html`
      <h1 id="enterStencilData">
        Enter Stencil Data
        <oscd-outlined-button
          class="button"
          @click=${() => {
            this.metadataIedItems = iedSelectItems(this.doc, true);
            this.iedStencilMetadataUI.show();
          }}
          >Add Stencil Metadata to IEDs
          <oscd-icon slot="icon">label</oscd-icon>
        </oscd-outlined-button>
      </h1>
      <div class="group appinf">
        <oscd-outlined-text-field
          id="stenname"
          label="Name"
          value="${this.stencilData.name ?? ''}"
        >
        </oscd-outlined-text-field>
        <oscd-outlined-text-field
          id="stenver"
          label="Version"
          value="${this.stencilData.version ?? ''}"
        >
        </oscd-outlined-text-field>
      </div>
      <oscd-outlined-button
        class="button"
        @click=${() => {
          this.stencilData = renameStencil(
            this.stencilData,
            this.stencilName.value.trim(),
            this.stencilVersion.value.trim()
          );
          this.storeSettings();
          this.resetCreateApplication();
        }}
        >Update Stencil Metadata
        <oscd-icon slot="icon">sync_alt</oscd-icon>
      </oscd-outlined-button>
      <h1>
        Enter Application Data
        <oscd-outlined-button
          class="button"
          @click=${() => {
            this.resetCreateApplication();
            this.appCategory.value = '';
            this.appName.value = '';
            this.appDesc.value = '';
            this.appVer.value = '';
            this.appVerDesc.value = '';
            this.appDeprecated.checked = false;
          }}
          >Reset Application
          <oscd-icon slot="icon">restart_alt</oscd-icon>
        </oscd-outlined-button>
      </h1>
      <div class="group appinf">
        <oscd-outlined-text-field
          id="appcat"
          label="Category"
          @change=${() => this.requestUpdate()}
        >
        </oscd-outlined-text-field>
        <oscd-outlined-text-field
          id="appname"
          label="Name"
          @change=${() => this.requestUpdate()}
        >
        </oscd-outlined-text-field>
        <oscd-outlined-text-field id="appdesc" label="Description">
        </oscd-outlined-text-field>
        <oscd-outlined-text-field
          id="appver"
          label="Version"
          @change=${() => this.requestUpdate()}
        ></oscd-outlined-text-field>
        <oscd-outlined-text-field id="appverdesc" label="Version Description">
        </oscd-outlined-text-field>
        <label id="deprecated">
          <oscd-checkbox id="appdeprecated" touch-target="wrapper"></oscd-checkbox>
          Deprecated
        </label>
      </div>
      <div class="group">
        <oscd-filled-button
          class="button"
          ?disabled=${!this.appCategory ||
          !this.appName ||
          !this.appVer ||
          this.appCategory?.value.trim() === '' ||
          this.appName?.value.trim() === '' ||
          this.appVer?.value.trim() === ''}
          @click=${() => {
            this.templateIedItems = iedSelectItems(this.doc);
            this.iedTemplateSelectorUI.show();
          }}
          >Add IEDs
          <oscd-icon slot="icon">developer_board</oscd-icon>
        </oscd-filled-button>
      </div>
      ${this.templateCreationStage >= 1 ? this.renderCbSelection() : nothing}
      ${this.templateCreationStage >= 2
        ? this.renderIedsToFunctionNaming()
        : nothing}
    `;
  }

  renderTemplateIedsSelector(): TemplateResult {
    return html`<oscd-dialog
      id="selection-dialog"
      @cancel=${(event: Event) => {
        event.preventDefault();
        // this.clearSelection();
      }}
    >
      <div slot="headline">Select IEDs to create a stencil application</div>
      <form slot="content" id="selection" method="dialog">
        <oscd-selection-list
          id="selection-list"
          filterable
          multiselect
          .items=${this.templateIedItems}
        ></oscd-selection-list>
      </form>
      <div slot="actions">
        <oscd-text-button
          @click="${() => {
            this.iedTemplateSelectorUI.close();
            this.clearIedTemplateSelection();
          }}"
          >Cancel</oscd-text-button
        >
        <oscd-text-button
          @click="${() => {
            const ieds: Element[] = this.selectionListUI.selectedElements;
            this.clearIedTemplateSelection();

            const iedNames = ieds.map(ied => ied.getAttribute('name'));

            const iedCombinations = Array.from(combinations(iedNames, 2));

            this.iedMappingStencilData = iedCombinations.flatMap(iedPairs => [
              // A to B, then B to A
              ...getMappingInfo(this.doc, iedPairs[0]!, iedPairs[1]!),
              ...getMappingInfo(this.doc, iedPairs[1]!, iedPairs[0]!)
            ]);

            this.templateCreationStage = 1;
          }}"
          form="selection"
          >Add IEDs</oscd-text-button
        >
      </div></oscd-dialog
    >`;
  }

  renderView(): TemplateResult {
    return this.renderOutputJSON();
  }

  renderErrorMessages(): TemplateResult {
    return html`<oscd-dialog
      id="error-dialog"
      type="alert"
      @cancel=${(event: Event) => {
        event.preventDefault();
        // this.clearSelection();
      }}
    >
      <div slot="headline">Errors occurred during template processing</div>
      <div slot="content">
        <p>
          The template was <em>not applied fully and correctly</em>. Either make
          changes manually or revert to a previous scd file.
        </p>
        <ul>
          ${this.errorMessages.map(message => html`<li>${message}</li>`)}
        </ul>
      </div>
      <div slot="actions">
        <oscd-text-button
          @click="${() => {
            this.errorMessages = [];
            this.errorDialogUI.close();
          }}"
          >Close</oscd-text-button
        >
      </div></oscd-dialog
    >`;
  }

  render(): TemplateResult {
    return html`<oscd-tabs
        .activeTabIndex=${this.tabIndex}
        @change=${(event: Event) => {
          this.tabIndex = (event.target as OscdTabs).activeTabIndex;

          if (this.tabIndex === 0) {
            this.showSupervisions = true;
            this.allowEditColumns = false;
          } else if (this.tabIndex === 1) {
            this.showSupervisions = true;
          }
        }}
      >
        <oscd-primary-tab inline-icon>
          <oscd-icon slot="icon">play_circle</oscd-icon>Use
        </oscd-primary-tab>
        <oscd-primary-tab inline-icon>
          <oscd-icon slot="icon">construction</oscd-icon>Create
        </oscd-primary-tab>
        <oscd-primary-tab inline-icon>
          <oscd-icon slot="icon">frame_source</oscd-icon>View
        </oscd-primary-tab>
      </oscd-tabs>
      <section>
        ${this.tabIndex === 0 ? this.renderUse() : nothing}
        ${this.tabIndex === 1 ? this.renderCreate() : nothing}
        ${this.tabIndex === 2 ? this.renderView() : nothing}
      </section>
      ${this.renderTemplateIedsSelector()}${this.renderFunctionIedSelector()}
      <oscd-snackbar id="snackBarMessage"></oscd-snackbar>
      ${this.renderAddStencilMetadata()}${this.renderErrorMessages()}`;
  }

  static styles = [
    ...themeStyles,
    css`
    :host {
      display: flex;
      flex-direction: column;

      --scrollbarBG: transparent;
      --thumbBG: var(--oscd-base1);
    }

    h1,
    h2,
    h3 {
      color: var(--oscd-base00);
      font-family: var(--oscd-text-font), sans-serif;
      font-weight: 300;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      margin: 0px;
      line-height: 48px;
      padding-left: 0.3em;
    }

    p {
      color: var(--oscd-base00);
      font-family: var(--oscd-text-font), sans-serif;
      font-weight: 300;
      text-overflow: ellipsis;
      margin: 0px;
      padding-left: 0.3em;
    }

    label {
      color: var(--oscd-base00);
      font-family: var(--oscd-text-font), sans-serif;
      font-weight: normal;
      display: flex;
      align-items: center;
    }

    oscd-tabs {
      width: 100%;
    }

    #outputView {
      width: 100%;
      max-height: 80vh;
      display: block;
      margin-top: 20px;
      --md-outlined-text-field-input-text-font: var(--oscd-text-font-mono);
    }

    #stencilName {
      width: 100%;
    }

    #appname,
    #appdesc,
    #stenname {
      width: 400px;
    }

    #applications,
    #iedsAndFunctions {
      width: 500px;
    }

    #stencilVersion {
      padding: 10px;
    }

    #changeStencil {
      display: none;
    }

    .iedfunction {
      width: 300px;
      min-width: 250px;
    }

    #appMaker {
      display: flex;
      flex-direction: row;
    }

    #appSelection {
      height: calc(100vh - 280px);
      overflow-y: clip;
    }

    #headline,
    #deprecated {
      display: flex;
      align-items: center;
    }

    #enterStencilData {
      display: flex;
      justify-content: space-between;
    }

    .button,
    .appinf > oscd-outlined-text-field {
      margin: 10px;
    }

    .group {
      display: flex;
      flex-direction: row;
    }

    .group.appinf {
      max-width: 95vw;
      flex-wrap: wrap;
    }

    .columngroup {
      display: flex;
      flex-direction: column;
      max-width: max-content;
    }

    .appIed {
      margin: 15px;
    }

    #appMenuHeader {
      display: flex;
      justify-content: space-between;
    }

    oscd-list-item.selected {
      background-color: color-mix(in srgb, var(--oscd-primary) 20%, transparent);
    }

    .menu-item {
      display: inline-flex;
      align-items: center;
    }

    section {
      position: relative;
      max-height: 100%;
      background-color: var(--oscd-base3);
      padding: 12px;
    }

    table {
      position: relative;
      border-collapse: collapse;
      border: 2px solid var(--oscd-base1);
      color: var(--oscd-base00);
      font-family: var(--oscd-text-font), sans-serif;
      font-weight: normal;
      padding: 12px;
      /* font-size: 0.8rem; */
      letter-spacing: 1px;
    }

    caption {
      caption-side: bottom;
      padding: 10px;
      font-weight: bold;
    }

    thead,
    tfoot {
      background-color: var(--oscd-base3);
    }

    th.stay[scope='col'] {
      position: sticky;
      top: 60px;
      background-color: var(--oscd-base3);
      padding: 5px 10px;
    }

    th,
    td {
      border: 1px solid var(--oscd-base1);
      padding: 3px 3px 5px 5px;
    }

    .diagonal {
      background-color: color-mix(in srgb, var(--oscd-primary) 20%, transparent);
    }

    td:last-of-type {
      text-align: center;
    }

    .mapcell {
      text-align: center;
    }

    .cbname {
      text-align: left;
      font-weight: 300;
      /* padding-left: 2px; */
      padding-right: 2px;
      position: sticky;
      left: 10px;
    }

    .indentcb {
      padding-left: 35px;
    }

    .indentied {
      padding-left: 25px;
    }

    .iednamebg {
      background-color: var(--oscd-base2);
    }

    .iedname {
      text-align: left;
      /* padding-left: 2px; */
      padding-right: 2px;
      position: sticky;
      left: 5px;
    }

    oscd-checkbox.cb {
      margin: 5px;
    }

    oscd-checkbox.cb {
      --md-checkbox-selected-container-color: var(--stencil-goose-color);
    }

    oscd-checkbox.cb.sv {
      --md-checkbox-selected-container-color: var(--stencil-sv-color);
    }

    .cb.sv {
      color: var(--stencil-sv-color);
    }

    .cb {
      color: var(--stencil-goose-color);
    }

    .rowselect,
    .colselect {
      margin: 0px;
    }

    .removeleftborder {
      border-left: none;
    }

    .removerightborder {
      border-right: none;
    }

    oscd-switch {
      padding: 15px;
    }

    #menuUse {
      display: inline-flex;
    }

    #appUseInfo {
      width: 470px;
      padding-left: 30px;
      text-overflow: clip;
      overflow: auto;
      line-height: 1.4;
    }

    #appContainer {
      padding-left: 20px;
      overflow: clip;
    }

    #controlBlockMappings {
      display: block;
      padding-left: 20px;
    }

    #supervisionInfo,
    #supervisionInfoSEL {
      font-size: 10px;
    }

    #applications,
    #iedsAndFunctions {
      height: calc(100vh - 410px);
      overflow-y: scroll;
    }

    .scrollable {
      scrollbar-width: auto;
      scrollbar-color: var(--thumbBG) var(--scrollbarBG);
    }

    .scrollable::-webkit-scrollbar {
      width: 6px;
    }

    .scrollable::-webkit-scrollbar-track {
      background: var(--scrollbarBG);
    }

    .scrollable::-webkit-scrollbar-thumb {
      background: var(--thumbBG);
      border-radius: 6px;
    }
  `
  ];
}
