import { expect, fixture, html } from '@open-wc/testing';
import { handleEdit } from '@omicronenergy/oscd-editor';
import type { OscdSelectionList } from '@omicronenergy/oscd-ui/selection-list/OscdSelectionList.js';
import type { OscdTabs } from '@omicronenergy/oscd-ui/tabs/OscdTabs.js';
import type { EditV2 } from '@openscd/oscd-api';


import OscdEditorStencil from './oscd-editor-stencil.js';
import { getMappingInfo } from './foundation/mapping-info.js';
import { fixtureXml } from './testing/fixture-scd.js';
import { makeApplication, makeStencil, makeVersion } from './testing/stencils.js';

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

  it('has Apply, Create and View tabs built from oscd-ui components', () => {
    const tabs = plugin.shadowRoot!.querySelector('oscd-tabs') as OscdTabs;
    expect(tabs.activeTabIndex).to.equal(0);
    const labels = Array.from(
      plugin.shadowRoot!.querySelectorAll('oscd-primary-tab')
    ).map(tab => tab.textContent?.replace(/\s+/g, '').replace('play_circle', '').replace('construction', '').replace('frame_source', ''));
    expect(labels).to.deep.equal(['Apply', 'Create', 'View']);
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

  describe('the apply view', () => {
    const applyView = () =>
      plugin.shadowRoot!.querySelector('oscd-stencil-apply') as HTMLElement & {
        stencil: unknown;
        doc: unknown;
      };

    const raise = <T>(name: string, detail: T) =>
      applyView().dispatchEvent(
        new CustomEvent(name, { detail, bubbles: true, composed: true })
      );

    it('is given the document and the stencil', async () => {
      plugin.stencilData = makeStencil([makeApplication('Bus', 'BZ', [makeVersion('1.0.0')])]);
      await plugin.updateComplete;
      expect(applyView().doc).to.equal(doc);
      expect(applyView().stencil).to.equal(plugin.stencilData);
    });

    it('asks for a document when none is loaded', async () => {
      const bare = await fixture<OscdEditorStencil>(
        html`<oscd-editor-stencil></oscd-editor-stencil>`
      );
      const view = bare.shadowRoot!.querySelector('oscd-stencil-apply')!;
      expect(view.shadowRoot!.textContent).to.contain('Please open a file');
      bare.remove();
    });

    it('commits what it applies as one edit with its title, and keeps the event inside the plugin', async () => {
      let escaped = 0;
      document.addEventListener('stencil-apply', () => (escaped += 1));
      const batch = [{ element: doc.documentElement, attributes: { foo: 'bar' } }];
      raise('stencil-apply', { edits: batch, title: 'Apply stencil X 1', plan: {} });

      expect(edits).to.have.lengthOf(1);
      expect(edits[0].type).to.equal('oscd-edit-v2');
      expect(edits[0].detail.title).to.equal('Apply stencil X 1');
      expect(edits[0].detail.edit).to.deep.equal(batch);
      expect(escaped).to.equal(0);
    });

    it('deletes a version from the stencil, keeps the rest and stores the result', async () => {
      plugin.stencilData = makeStencil([
        makeApplication('Bus', 'BZ', [makeVersion('1.0.0'), makeVersion('2.0.0')])
      ]);
      await plugin.updateComplete;

      raise('stencil-delete-version', { category: 'Bus', name: 'BZ', version: '2.0.0' });
      await plugin.updateComplete;

      expect(plugin.stencilData.applications[0].versions.map(v => v.version)).to.deep.equal(['1.0.0']);
      expect(JSON.parse(localStorage.getItem('oscd-stencil')!).applications[0].versions).to.have.lengthOf(1);
    });

    it('removes the application with its last version', async () => {
      plugin.stencilData = makeStencil([makeApplication('Bus', 'BZ', [makeVersion('1.0.0')])]);
      await plugin.updateComplete;
      raise('stencil-delete-version', { category: 'Bus', name: 'BZ', version: '1.0.0' });
      expect(plugin.stencilData.applications).to.be.empty;
    });
  });

  describe('loading and editing the stencil as text', () => {
    const fileEvent = (content: string) =>
      ({ target: { files: { item: () => new File([content], 'stencil.json') } } }) as unknown as Event;

    it('loads a stencil file even when no application is selected', async () => {
      await plugin.loadStencil(
        fileEvent(JSON.stringify(makeStencil([makeApplication('Bus', 'BZ', [makeVersion('1.0.0')])])))
      );
      expect(plugin.stencilData.applications).to.have.lengthOf(1);
      expect(JSON.parse(localStorage.getItem('oscd-stencil')!).schemaVersion).to.equal(2);
    });

    it('keeps the current stencil and does not throw for a file that is not JSON', async () => {
      const before = plugin.stencilData;
      await plugin.loadStencil(fileEvent('{ not json'));
      expect(plugin.stencilData).to.equal(before);
    });

    it('keeps the current stencil for JSON that is not a stencil', async () => {
      const before = plugin.stencilData;
      await plugin.loadStencil(fileEvent('{"name": 5}'));
      expect(plugin.stencilData).to.equal(before);
    });

    it('does not take invalid text typed into the View tab', async () => {
      await showTab(2);
      const before = plugin.stencilData;
      const field = plugin.shadowRoot!.querySelector('#outputView') as HTMLInputElement;
      field.value = '{ broken';
      field.dispatchEvent(new Event('change'));
      await plugin.updateComplete;
      expect(plugin.stencilData).to.equal(before);
    });

    it('takes valid text typed into the View tab', async () => {
      await showTab(2);
      const field = plugin.shadowRoot!.querySelector('#outputView') as HTMLInputElement;
      field.value = JSON.stringify(makeStencil([makeApplication('Bus', 'BZ', [makeVersion('3.0.0')])]));
      field.dispatchEvent(new Event('change'));
      await plugin.updateComplete;
      expect(plugin.stencilData.applications[0].versions[0].version).to.equal('3.0.0');
    });

    it('starts with an empty stencil when the stored one is damaged', async () => {
      localStorage.setItem('oscd-stencil', '{ damaged');
      const fresh = await fixture<OscdEditorStencil>(html`<oscd-editor-stencil></oscd-editor-stencil>`);
      expect(fresh.stencilData.applications).to.be.empty;
      fresh.remove();
    });

    it('downloads JSON with a file name that has every space replaced', async () => {
      const original = { create: URL.createObjectURL, click: HTMLAnchorElement.prototype.click };
      let blob: Blob | undefined;
      let downloaded: string | undefined;
      URL.createObjectURL = (b: Blob | MediaSource) => {
        blob = b as Blob;
        return 'blob:test';
      };
      HTMLAnchorElement.prototype.click = function click() {
        downloaded = this.download;
      };
      try {
        plugin.stencilData = { ...makeStencil(), name: 'Digital Substation Play', version: '0.0.2' };
        plugin.saveStencilAsFile();
      } finally {
        URL.createObjectURL = original.create;
        HTMLAnchorElement.prototype.click = original.click;
      }
      expect(blob?.type).to.equal('application/json');
      expect(downloaded).to.equal('Digital_Substation_Play_0.0.2.json');
    });
  });

  describe('creating an application', () => {
    const create = async (fields: Record<string, string>) => {
      await showTab(1);
      plugin.iedMappingStencilData = getMappingInfo(doc, 'PUB1', 'SUB1');
      plugin.uniqueIeds = ['PUB1', 'SUB1'];
      plugin.templateCreationStage = 2;
      await plugin.updateComplete;
      Object.entries(fields).forEach(([id, value]) => {
        (plugin.shadowRoot!.querySelector(`#${id}`) as HTMLInputElement).value = value;
      });
      await click('oscd-filled-button', 'Add Application');
    };

    it('adds a new version to an existing application instead of a second application', async () => {
      plugin.stencilData = makeStencil([
        makeApplication('Bus', 'BZ', [makeVersion('1.0.0')])
      ]);
      await create({ appcat: 'Bus', appname: 'BZ', appver: '2.0.0' });

      expect(plugin.stencilData.applications).to.have.lengthOf(1);
      expect(plugin.stencilData.applications[0].versions.map(v => v.version)).to.deep.equal(['1.0.0', '2.0.0']);
    });

    it('replaces a version with the same number in place', async () => {
      plugin.stencilData = makeStencil([
        makeApplication('Bus', 'BZ', [makeVersion('1.0.0'), makeVersion('2.0.0')])
      ]);
      await create({ appcat: 'Bus', appname: 'BZ', appver: '1.0.0', appverdesc: 'again' });

      expect(plugin.stencilData.applications).to.have.lengthOf(1);
      expect(plugin.stencilData.applications[0].versions.map(v => `${v.version}:${v.description}`)).to.deep.equal(['1.0.0:again', '2.0.0:version 2.0.0']);
    });

    it('creates the first application of an empty stencil with the functions it was given', async () => {
      await create({ appcat: 'Bus', appname: 'BZ', appver: '1.0.0' });

      const [app] = plugin.stencilData.applications;
      expect(app).to.include({ category: 'Bus', name: 'BZ' });
      expect(Object.keys(app.versions[0].IEDS).sort()).to.deep.equal(['PUB1', 'SUB1']);
      expect(app.versions[0].ControlBlocks).to.have.lengthOf(2);
    });
  });
});

