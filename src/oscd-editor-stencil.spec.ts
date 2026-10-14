import { expect, fixture, html } from '@open-wc/testing';
import { handleEdit } from '@omicronenergy/oscd-editor';
import type { OscdSelectionList } from '@omicronenergy/oscd-ui/selection-list/OscdSelectionList.js';
import type { OscdTabs } from '@omicronenergy/oscd-ui/tabs/OscdTabs.js';
import type { EditV2 } from '@openscd/oscd-api';


import OscdEditorStencil from './oscd-editor-stencil.js';
import { getMappingInfo } from './foundation/mapping-info.js';
import { fixtureXml } from './testing/fixture-scd.js';
import { applicationFrom, cloneAsClean } from './testing/scl.js';

customElements.define('oscd-editor-stencil', OscdEditorStencil);

describe('oscd-editor-stencil', () => {
  let plugin: OscdEditorStencil;

  beforeEach(async () => {
    localStorage.removeItem('oscd-stencil');
    plugin = await fixture(html`<oscd-editor-stencil></oscd-editor-stencil>`);
  });

  afterEach(() => {
    plugin.remove();
  });

  it('asks for a document when none is loaded', () => {
    expect(plugin.shadowRoot?.textContent).to.contain('Please open a file');
  });

  it('renders the stencil header once a document is loaded', async () => {
    plugin.doc = new DOMParser().parseFromString(fixtureXml, 'application/xml');
    plugin.docVersion = 1;
    await plugin.updateComplete;

    expect(plugin.shadowRoot?.querySelector('#stencilName')).to.exist;
  });

  it('accepts docVersion and does not expose the legacy editCount', () => {
    expect('docVersion' in plugin).to.be.true;
    expect('editCount' in plugin).to.be.false;
  });
});

describe('oscd-editor-stencil UI', () => {
  let plugin: OscdEditorStencil;
  let doc: XMLDocument;
  let edits: CustomEvent[];

  const click = async (selector: string, text: string) => {
    const button = Array.from(
      plugin.shadowRoot!.querySelectorAll(selector)
    ).find(el => el.textContent?.includes(text)) as HTMLElement | undefined;
    expect(button, `${selector} "${text}"`).to.exist;
    button!.click();
    await plugin.updateComplete;
  };

  const showTab = async (index: number) => {
    const tabs = plugin.shadowRoot!.querySelector('oscd-tabs') as OscdTabs;
    tabs.activeTabIndex = index;
    tabs.dispatchEvent(new Event('change'));
    await plugin.updateComplete;
  };

  beforeEach(async () => {
    localStorage.removeItem('oscd-stencil');
    doc = new DOMParser().parseFromString(fixtureXml, 'application/xml');
    plugin = await fixture(
      html`<oscd-editor-stencil .doc=${doc}></oscd-editor-stencil>`
    );
    edits = [];
    plugin.addEventListener('oscd-edit-v2', event =>
      edits.push(event as CustomEvent)
    );
  });

  afterEach(() => {
    plugin.remove();
  });

  it('has Use, Create and View tabs built from oscd-ui components', () => {
    const tabs = plugin.shadowRoot!.querySelector('oscd-tabs') as OscdTabs;
    expect(tabs.activeTabIndex).to.equal(0);
    const labels = Array.from(
      plugin.shadowRoot!.querySelectorAll('oscd-primary-tab')
    ).map(tab => tab.textContent?.replace(/\s+/g, '').replace('play_circle', '').replace('construction', '').replace('frame_source', ''));
    expect(labels).to.deep.equal(['Use', 'Create', 'View']);
  });

  it('shows the matching view when a tab is selected', async () => {
    expect(plugin.shadowRoot!.querySelector('#stencilName')).to.exist;

    await showTab(1);
    expect(plugin.shadowRoot!.textContent).to.contain('Enter Stencil Data');

    await showTab(2);
    expect(plugin.shadowRoot!.querySelector('#outputView')).to.exist;
  });

  describe('adding stencil metadata to IEDs', () => {
    const openDialog = async () => {
      await showTab(1);
      await click('oscd-outlined-button', 'Add Stencil Metadata to IEDs');
    };

    it('offers every IED of the document', async () => {
      await openDialog();
      const list = plugin.shadowRoot!.querySelector(
        '#stencil-metadata-ieds'
      ) as OscdSelectionList;
      expect(list.items.map(item => item.attachedElement?.getAttribute('name'))).to.deep.equal(
        ['PUB1', 'SUB1', 'SELR', 'EDN1']
      );
    });

    it('commits one edit that tags the selected IEDs and updates tags on a second run', async () => {
      await openDialog();
      const list = plugin.shadowRoot!.querySelector(
        '#stencil-metadata-ieds'
      ) as OscdSelectionList;
      list.items[1].selected = true;
      list.items[2].selected = true;

      await click('oscd-text-button', 'Add Metadata');

      expect(edits).to.have.lengthOf(1);
      expect(edits[0].type).to.equal('oscd-edit-v2');
      expect(edits[0].detail.title).to.equal('Add stencil metadata');
      expect(edits[0].detail.edit).to.have.lengthOf(4);
      (edits[0].detail.edit as EditV2[]).forEach(edit => handleEdit(edit));
      expect(doc.querySelectorAll('IED > Private')).to.have.lengthOf(4);

      // a second run with a new version updates in place
      await openDialog();
      const again = plugin.shadowRoot!.querySelector(
        '#stencil-metadata-ieds'
      ) as OscdSelectionList;
      again.items[1].selected = true;
      (plugin.shadowRoot!.querySelector('#stencil-ver') as HTMLInputElement).value =
        '2.0.0';
      await click('oscd-text-button', 'Add Metadata');

      expect(edits).to.have.lengthOf(2);
      (edits[1].detail.edit as EditV2[]).forEach(edit => handleEdit(edit));
      expect(doc.querySelectorAll('IED > Private')).to.have.lengthOf(4);
      expect(
        doc.querySelector(
          'IED[name="SUB1"] > Private[type="OpenSCD-Stencil-Version"]'
        )?.textContent
      ).to.equal('2.0.0');
    });
  });

  describe('applying a stencil', () => {
    beforeEach(async () => {
      cloneAsClean(doc, 'PUB1', 'PUB2');
      cloneAsClean(doc, 'SUB1', 'SUB2');
      const version = applicationFrom(
        getMappingInfo(doc, 'PUB1', 'SUB1'),
        'PUBF',
        'SUBF'
      );
      version.IEDS = {
        PUBF: { originalName: 'PUB1', type: '7SS85', manufacturer: 'SIEMENS', privates: [] },
        SUBF: { originalName: 'SUB1', type: '6MU85', manufacturer: 'SIEMENS', privates: [] }
      };
      const application = { category: 'Bus', name: 'BZ', description: '', versions: [version] };
      plugin.stencilData = { name: 'Test', version: '1', applications: [application] };
      plugin.selectedApplication = application;
      plugin.selectedAppVersion = version;
      plugin.functionToIed = new Map([
        ['PUBF', 'PUB2'],
        ['SUBF', 'SUB2']
      ]);
      await plugin.updateComplete;
    });

    it('commits a single titled edit event and reports the counts', async () => {
      await click('oscd-filled-button', 'Apply Stencil');

      expect(edits).to.have.lengthOf(1);
      expect(edits[0].detail.title).to.equal('Apply stencil BZ 1.0.0');
      expect(plugin.errorMessages).to.be.empty;
      (edits[0].detail.edit as EditV2[]).forEach(edit => handleEdit(edit));
      expect(
        doc.querySelector('IED[name="SUB2"] ExtRef[intAddr="I1"]')?.getAttribute('iedName')
      ).to.equal('PUB2');
      expect(plugin.functionToIed.size).to.equal(0);
    });

    it('lists what could not be found in the error dialog', async () => {
      plugin.functionToIed = new Map([
        ['PUBF', 'NOPE'],
        ['SUBF', 'SUB2']
      ]);
      await plugin.updateComplete;
      await click('oscd-filled-button', 'Apply Stencil');

      expect(edits).to.be.empty;
      expect(plugin.errorMessages).to.include('Could not find CB: NOPE>>LD0>GC1');
      await plugin.updateComplete;
      expect(plugin.shadowRoot!.querySelector('#error-dialog')!.textContent).to.contain(
        'Could not find CB: NOPE>>LD0>GC1'
      );
    });
  });
});
