import { expect, fixture, html } from '@open-wc/testing';
import type { OscdOutlinedSelect } from '@omicronenergy/oscd-ui/select/OscdOutlinedSelect.js';
import type { OscdOutlinedTextField } from '@omicronenergy/oscd-ui/textfield/OscdOutlinedTextField.js';
import type { OscdSwitch } from '@omicronenergy/oscd-ui/switch/OscdSwitch.js';

import { OscdStencilManage, nodeId } from './manage-view.js';
import type { LibraryEntry } from '../foundation/library.js';
import type { StencilData } from '../foundation/types.js';
import { fixtureXml } from '../testing/fixture-scd.js';
import { makeApplication, makeStencil, makeVersion } from '../testing/stencils.js';

customElements.define('oscd-stencil-manage', OscdStencilManage);

const key = { category: 'Bus', name: 'BZ' };

describe('oscd-stencil-manage', () => {
  let el: OscdStencilManage;
  let events: { type: string; detail: unknown }[];

  const stencilOf = (): StencilData =>
    makeStencil([
      makeApplication('Bus', 'BZ', [
        makeVersion('1.0.0'),
        { ...makeVersion('2.0.0'), deprecated: true }
      ]),
      makeApplication('Bus', 'Other', [makeVersion('1.0.0')]),
      makeApplication('Line', 'Dist', [makeVersion('1.0.0')])
    ]);

  const library = (stencil: StencilData): LibraryEntry[] => [
    { id: 'a', stencil, lastUsed: 2 },
    { id: 'b', stencil: { ...stencil, name: 'Second' }, lastUsed: 1 }
  ];

  const q = <T extends Element>(selector: string) =>
    el.shadowRoot!.querySelector(selector) as T;

  const select = async (id: string) => {
    q('oscd-tree').dispatchEvent(
      new CustomEvent('selected-ids-changed', { detail: { selectedIds: [id] } })
    );
    await el.updateComplete;
  };

  const type = async (id: string, value: string) => {
    const field = q<OscdOutlinedTextField>(`#${id}`);
    expect(field, id).to.exist;
    field.value = value;
    field.dispatchEvent(new Event('change'));
    await el.updateComplete;
  };

  const last = (name: string) => {
    const matching = events.filter(event => event.type === name);
    return matching[matching.length - 1]?.detail;
  };

  /** Behaves as the plugin does: the new stencil is given back to the view. */
  const follow = () =>
    el.addEventListener('stencil-change', (e) => {
      el.stencil = (e as CustomEvent<StencilData>).detail;
    });

  beforeEach(async () => {
    const stencil = stencilOf();
    el = await fixture(
      html`<oscd-stencil-manage
        .stencil=${stencil}
        .library=${library(stencil)}
        currentId="a"
      ></oscd-stencil-manage>`
    );
    events = [];
    [
      'stencil-change',
      'stencil-select',
      'stencil-import',
      'stencil-export',
      'stencil-remove',
      'stencil-tag'
    ].forEach(type =>
      el.addEventListener(type, e =>
        events.push({ type, detail: (e as CustomEvent).detail })
      )
    );
  });

  afterEach(() => el.remove());

  describe('the library', () => {
    it('lists the stencils and selects one', async () => {
      const select = q<OscdOutlinedSelect>('#stencils');
      expect(select.querySelectorAll('oscd-select-option')).to.have.lengthOf(2);
      select.value = 'b';
      select.dispatchEvent(new Event('change'));
      expect(last('stencil-select')).to.equal('b');
    });

    it('imports and exports', async () => {
      q<HTMLElement>('#import').click();
      await el.updateComplete;
      q<HTMLElement>('#export').click();
      await el.updateComplete;
      expect(events.map(event => event.type)).to.deep.equal([
        'stencil-import',
        'stencil-export'
      ]);
    });

    it('renames the stencil and refuses empty names and versions', async () => {
      await type('stencil-name', ' Renamed ');
      expect((last('stencil-change') as StencilData).name).to.equal('Renamed');

      await type('stencil-version', '3.1.0');
      expect((last('stencil-change') as StencilData).version).to.equal('3.1.0');

      const count = events.length;
      await type('stencil-name', ' ');
      await type('stencil-version', '');
      expect(events).to.have.lengthOf(count);
      expect(q<OscdOutlinedTextField>('#stencil-name').errorText).to.not.equal('');
      expect(q<OscdOutlinedTextField>('#stencil-version').error).to.be.true;

      await type('stencil-name', 'Fine');
      expect(q<OscdOutlinedTextField>('#stencil-name').error).to.be.false;
    });

    it('asks before removing the stencil from the library', async () => {
      q<HTMLElement>('#remove-stencil').click();
      await el.updateComplete;
      expect(q('#confirm').hasAttribute('open')).to.be.true;
      expect(events.filter(event => event.type === 'stencil-remove')).to.be.empty;

      q<HTMLElement>('#confirm-ok').click();
      await el.updateComplete;
      expect(last('stencil-remove')).to.equal('a');
      expect(q('#confirm').hasAttribute('open')).to.be.false;
    });

    it('cannot remove when there is no stencil in the library', async () => {
      el.currentId = '';
      await el.updateComplete;
      expect(q<HTMLButtonElement>('#remove-stencil').disabled).to.be.true;
    });
  });

  describe('the tree', () => {
    it('groups applications by category with their versions, marking deprecated ones', async () => {
      await (q('oscd-tree') as unknown as { updateComplete: Promise<unknown> }).updateComplete;
      const labels = Array.from(
        q('oscd-tree').shadowRoot!.querySelectorAll('oscd-tree-item')
      ).map(item => item.textContent!.replace(/\s+/g, ' ').trim());
      expect(labels.join('|')).to.contain('Bus');
      expect(labels.join('|')).to.contain('Line');
      expect(labels.join('|')).to.contain('2.0.0 (deprecated)');
      expect(labels.join('|')).to.not.contain('1.0.0 (deprecated)');
    });

    it('says there is nothing to manage in an empty stencil', async () => {
      el.stencil = makeStencil();
      await el.updateComplete;
      expect(q('#empty')).to.exist;
      expect(q('oscd-tree')).to.not.exist;
    });

    it('asks to choose something until it is chosen', async () => {
      expect(q('#pick')).to.exist;
      expect(q('#application')).to.not.exist;
      await select('Bus');
      expect(q('#pick')).to.exist;
    });

    it('shows an application, and a version with its control blocks', async () => {
      await select(nodeId(key));
      expect(q('#application')).to.exist;
      expect(q('#version')).to.not.exist;
      expect(q('#delete-application')).to.exist;

      await select(nodeId({ ...key, version: '1.0.0' }));
      expect(q('#version')).to.exist;
      expect(q('oscd-stencil-mapping-table')).to.exist;
      expect(q('#delete-application')).to.not.exist;
      expect(q('#fn-Fn')).to.exist;
    });

    it('forgets the selection when it is no longer in the stencil, or the stencil changes', async () => {
      await select(nodeId({ ...key, version: '1.0.0' }));
      el.stencil = makeStencil([makeApplication('Line', 'Dist', [makeVersion('1.0.0')])]);
      await el.updateComplete;
      expect(el.selection).to.equal(null);

      await select(nodeId({ category: 'Line', name: 'Dist', version: '9.9.9' }));
      el.stencil = { ...el.stencil };
      await el.updateComplete;
      expect(el.selection).to.equal(null);

      await select(nodeId({ category: 'Line', name: 'Dist' }));
      el.currentId = 'b';
      await el.updateComplete;
      expect(el.selection).to.equal(null);
    });
  });

  describe('editing an application', () => {
    beforeEach(async () => {
      follow();
      await select(nodeId(key));
    });

    it('renames it and keeps it selected', async () => {
      await type('app-name', 'Zone');
      expect((last('stencil-change') as StencilData).applications[0].name).to.equal('Zone');
      expect(el.selection).to.deep.include({ category: 'Bus', name: 'Zone' });
      expect(q('#application')).to.exist;
    });

    it('changes the category and the description', async () => {
      await type('app-category', 'Protection');
      await type('app-description', 'Details');
      const [app] = (last('stencil-change') as StencilData).applications;
      expect(app).to.include({ category: 'Protection', description: 'Details' });
    });

    it('refuses a name another application has, explaining why', async () => {
      await type('app-name', 'Other');
      expect(events).to.be.empty;
      expect(q<OscdOutlinedTextField>('#app-name').errorText).to.contain('exists');
    });

    it('deletes the application after confirmation', async () => {
      q<HTMLElement>('#delete-application').click();
      await el.updateComplete;
      expect(events).to.be.empty;

      q<HTMLElement>('#confirm-ok').click();
      await el.updateComplete;
      expect(
        (last('stencil-change') as StencilData).applications.map(app => app.name)
      ).to.deep.equal(['Other', 'Dist']);
      expect(el.selection).to.equal(null);
    });
  });

  describe('editing a version', () => {
    const version = { ...key, version: '1.0.0' };

    beforeEach(async () => {
      follow();
      await select(nodeId(version));
    });

    const versions = () =>
      (last('stencil-change') as StencilData).applications[0].versions;

    it('changes its number and keeps it selected', async () => {
      await type('ver-version', '1.1.0');
      expect(versions()[0].version).to.equal('1.1.0');
      expect(el.selection?.version).to.equal('1.1.0');
    });

    it('refuses a version that exists', async () => {
      await type('ver-version', '2.0.0');
      expect(events).to.be.empty;
      expect(q<OscdOutlinedTextField>('#ver-version').errorText).to.contain('exists');
    });

    it('changes the description and deprecates it', async () => {
      await type('ver-description', 'Newer words');
      expect(versions()[0].description).to.equal('Newer words');

      const toggle = q<OscdSwitch>('#deprecated');
      toggle.selected = true;
      toggle.dispatchEvent(new Event('change'));
      expect(versions()[0].deprecated).to.be.true;
    });

    it('renames a function, refusing a name already used or empty', async () => {
      await type('fn-Fn', 'Publisher');
      expect(Object.keys(versions()[0].IEDS)).to.deep.equal(['Publisher']);

      el.stencil = {
        ...el.stencil,
        applications: el.stencil.applications.map(app => ({
          ...app,
          versions: app.versions.map(v =>
            v.version === '1.0.0'
              ? { ...v, IEDS: { ...v.IEDS, Second: v.IEDS.Publisher } }
              : v
          )
        }))
      };
      await el.updateComplete;
      const count = events.length;
      await type('fn-Publisher', 'Second');
      await type('fn-Publisher', ' ');
      expect(events).to.have.lengthOf(count);
      expect(q<OscdOutlinedTextField>('#fn-Publisher').errorText).to.not.equal('');
    });

    it('changes what a function requires', async () => {
      await type('fn-Fn-manufacturer', 'ABB');
      await type('fn-Fn-type', 'REL670');
      await type('fn-Fn-id', 'BZ-REL');
      await type('fn-Fn-idversion', '2.0.0');
      const requirement = versions()[0].IEDS.Fn;
      expect(requirement).to.include({ manufacturer: 'ABB', type: 'REL670' });
      expect(requirement.privates[0]).to.deep.equal({
        'OpenSCD-Stencil-Id': 'BZ-REL',
        'OpenSCD-Stencil-Version': '2.0.0'
      });
    });

    it('asks to tag IEDs', () => {
      q<HTMLElement>('#tag').click();
      expect((last('stencil-tag') as { version: string }).version).to.equal('1.0.0');
    });

    it('asks before deleting a version, and can be cancelled', async () => {
      q<HTMLElement>('#delete-version').click();
      await el.updateComplete;
      expect(q('#confirm').textContent).to.contain('BZ 1.0.0');
      q<HTMLElement>('#cancel').click();
      await el.updateComplete;
      expect(events).to.be.empty;
      expect(q('#confirm').hasAttribute('open')).to.be.false;

      q<HTMLElement>('#delete-version').click();
      await el.updateComplete;
      q<HTMLElement>('#confirm-ok').click();
      await el.updateComplete;
      expect(versions().map(v => v.version)).to.deep.equal(['2.0.0']);
      expect(el.selection).to.equal(null);
    });

    it('shows a version that has no stencil tag', async () => {
      const bare = {
        ...makeVersion('3.0.0'),
        IEDS: { Fn: { ...makeVersion('3.0.0').IEDS.Fn, privates: [] } }
      };
      el.stencil = makeStencil([makeApplication('Bus', 'BZ', [bare])]);
      await select(nodeId({ ...key, version: '3.0.0' }));
      expect(q<OscdOutlinedTextField>('#fn-Fn-id').value).to.equal('');
      await type('fn-Fn-id', 'Tagged');
      expect(versions()[0].IEDS.Fn.privates[0]['OpenSCD-Stencil-Id']).to.equal('Tagged');
    });
  });

  describe('capturing and editing JSON from here', () => {
    const wizard = () => q('oscd-stencil-capture');
    const hidden = (selector: string) => q(selector).hasAttribute('hidden');

    it('cannot capture without a document, and shows the wizard in place of the stencils with one', async () => {
      expect(q<HTMLButtonElement>('#capture').disabled).to.be.true;

      el.doc = new DOMParser().parseFromString(fixtureXml, 'application/xml');
      await el.updateComplete;
      q<HTMLElement>('#capture').click();
      await el.updateComplete;

      expect(el.view).to.equal('capture');
      expect(wizard()).to.exist;
      expect(hidden('.browse')).to.be.true;
      expect(hidden('#capture-view')).to.be.false;
    });

    it('keeps the wizard when going back, and returns when the wizard says it is done', async () => {
      el.doc = new DOMParser().parseFromString(fixtureXml, 'application/xml');
      el.openCapture();
      await el.updateComplete;

      q<HTMLElement>('#back').click();
      await el.updateComplete;
      expect(el.view).to.equal('browse');
      expect(hidden('.browse')).to.be.false;
      expect(wizard()).to.exist;

      el.openCapture();
      await el.updateComplete;
      let escaped = 0;
      document.addEventListener('stencil-goto', () => (escaped += 1));
      wizard().dispatchEvent(
        new CustomEvent('stencil-goto', { detail: 'manage', bubbles: true, composed: true })
      );
      await el.updateComplete;
      expect(el.view).to.equal('browse');
      expect(escaped).to.equal(0);
    });

    it('edits the whole stencil, an application or a version as JSON', async () => {
      q<HTMLElement>('#edit-json-stencil').click();
      await el.updateComplete;
      expect(el.view).to.equal('json');
      expect(el.jsonScope).to.deep.equal({ kind: 'stencil' });
      expect(q('oscd-stencil-json')).to.exist;
      q<HTMLElement>('#back').click();
      await el.updateComplete;
      expect(q('oscd-stencil-json')).to.not.exist;

      await select(nodeId(key));
      q<HTMLElement>('#edit-json-application').click();
      await el.updateComplete;
      expect(el.jsonScope).to.deep.equal({ kind: 'application', key });
      q<HTMLElement>('#back').click();

      await select(nodeId({ ...key, version: '1.0.0' }));
      q<HTMLElement>('#edit-json-version').click();
      await el.updateComplete;
      expect(el.jsonScope).to.deep.equal({ kind: 'version', key, version: '1.0.0' });
    });

    it('leaves the JSON editor when what it was editing is gone, and when another stencil is chosen', async () => {
      follow();
      await select(nodeId({ ...key, version: '1.0.0' }));
      q<HTMLElement>('#edit-json-version').click();
      await el.updateComplete;

      el.stencil = {
        ...el.stencil,
        applications: el.stencil.applications.map(app =>
          app.name === 'BZ' ? { ...app, versions: app.versions.filter(v => v.version !== '1.0.0') } : app
        )
      };
      await el.updateComplete;
      expect(el.view).to.equal('browse');

      q<HTMLElement>('#edit-json-stencil').click();
      await el.updateComplete;
      el.currentId = 'b';
      await el.updateComplete;
      expect(el.view).to.equal('browse');

      await select(nodeId(key));
      q<HTMLElement>('#edit-json-application').click();
      await el.updateComplete;
      el.stencil = makeStencil();
      await el.updateComplete;
      expect(el.view).to.equal('browse');
    });
  });
});
