import { expect, fixture, html } from '@open-wc/testing';
import { handleEdit } from '@omicronenergy/oscd-editor';
import type { OscdOutlinedSelect } from '@omicronenergy/oscd-ui/select/OscdOutlinedSelect.js';
import type { OscdSelectionList } from '@omicronenergy/oscd-ui/selection-list/OscdSelectionList.js';
import type { EditV2 } from '@openscd/oscd-api';

import { OscdStencilApply } from './apply-view.js';
import type { StencilApplyDetail } from './apply-view.js';
import { getMappingInfo } from '../foundation/mapping-info.js';
import type { StencilData } from '../foundation/types.js';
import { buildDocument, buildVersion } from '../testing/apply-fixture.js';
import { applicationFrom } from '../testing/scl.js';
import { makeApplication, makeStencil, makeVersion } from '../testing/stencils.js';

customElements.define('oscd-stencil-apply', OscdStencilApply);

describe('oscd-stencil-apply', () => {
  let el: OscdStencilApply;
  let doc: XMLDocument;
  let stencil: StencilData;
  let applied: StencilApplyDetail[];

  const q = <T extends Element>(selector: string) =>
    el.shadowRoot!.querySelector(selector) as T;
  const qa = <T extends Element>(selector: string) =>
    Array.from(el.shadowRoot!.querySelectorAll(selector)) as T[];

  const click = async (selector: string) => {
    expect(q(selector), selector).to.exist;
    q<HTMLElement>(selector).click();
    await el.updateComplete;
  };

  const chooseFirstApplication = async () => {
    const list = q<OscdSelectionList>('#applications');
    (list.shadowRoot!.querySelector('oscd-list-item') as HTMLElement).click();
    await el.updateComplete;
  };

  const assign = async (fn: string, iedName: string) => {
    const select = q<OscdOutlinedSelect>(`[data-function="${fn}"] oscd-outlined-select`);
    select.value = iedName;
    select.dispatchEvent(new Event('change'));
    await el.updateComplete;
  };

  const toAssign = async () => {
    await chooseFirstApplication();
    await click('#next');
  };

  const toReview = async () => {
    await toAssign();
    await assign('Publisher', 'PUB2');
    await assign('Subscriber', 'SUB2');
    await click('#next');
  };

  beforeEach(async () => {
    doc = buildDocument();
    stencil = makeStencil([
      makeApplication('Bus', 'BZ', [buildVersion(doc)]),
      makeApplication('Line', 'Old', [makeVersion('1.0.0', true)])
    ]);
    el = await fixture(
      html`<oscd-stencil-apply .doc=${doc} .stencil=${stencil}></oscd-stencil-apply>`
    );
    applied = [];
    el.addEventListener('stencil-apply', e =>
      applied.push((e as CustomEvent<StencilApplyDetail>).detail)
    );
  });

  afterEach(() => el.remove());

  describe('before anything is chosen', () => {
    it('asks for a document when none is loaded', async () => {
      el.doc = undefined;
      await el.updateComplete;
      expect(el.shadowRoot!.textContent).to.contain('Please open a file');
    });

    it('explains an empty stencil', async () => {
      el.stencil = makeStencil();
      await el.updateComplete;
      expect(q('#empty').textContent).to.contain('no applications');
    });

    it('lists the usable applications and hides ones with only deprecated versions', () => {
      const list = q<OscdSelectionList>('#applications');
      expect(list.items.map(i => i.headline)).to.deep.equal(['BZ']);
    });

    it('shows deprecated-only applications when asked', async () => {
      q<HTMLElement>('#show-deprecated').dispatchEvent(new Event('change'));
      await el.updateComplete;
      expect(q<OscdSelectionList>('#applications').items.map(i => i.headline)).to.deep.equal(
        ['BZ', 'Old']
      );
    });

    it('marks the first step as current', () => {
      const steps = qa('.steps li');
      expect(steps.map(s => s.getAttribute('aria-current'))).to.deep.equal([
        'step',
        null,
        null
      ]);
    });
  });

  describe('choosing an application', () => {
    beforeEach(chooseFirstApplication);

    it('shows what it contains and what it needs', () => {
      expect(q('#summary').textContent!.replace(/\s+/g, ' ')).to.contain(
        '3 functions · 1 GOOSE · 1 SV · 3 subscriptions · 2 supervisions'
      );
      const needs = qa('.needs li').map(li => li.textContent!.replace(/\s+/g, ' ').trim());
      expect(needs.join('|')).to.contain('Publisher SIEMENS 7SS85, tagged BZ-Publisher 1.0.0');
      expect(needs.join('|')).to.contain('Relay SEL SEL-421');
    });

    it('shows the mappings of the application before it is applied', () => {
      const table = q<HTMLElement & { controlBlocks: unknown[]; markers: Map<string, unknown> }>(
        'oscd-stencil-mapping-table'
      );
      expect(table.controlBlocks).to.have.lengthOf(2);
      expect(table.markers.size).to.equal(0);
      const cells = Array.from(
        table.shadowRoot!.querySelectorAll('td.mapped')
      );
      expect(cells).to.have.lengthOf(2);
    });

    it('offers a version choice only when there is a choice, and uses the newest', async () => {
      expect(q('#version')).to.be.null;

      const app = stencil.applications[0];
      const newer = { ...buildVersion(doc), version: '2.0.0', description: 'newer' };
      el.stencil = {
        ...stencil,
        applications: [{ ...app, versions: [...app.versions, newer] }, stencil.applications[1]]
      };
      await el.updateComplete;
      // choose again, so the newest version is picked
      el.reset();
      await el.updateComplete;
      await chooseFirstApplication();
      expect(el.version?.version).to.equal('2.0.0');
      expect(q('#version')).to.exist;

      const select = q<OscdOutlinedSelect>('#version');
      select.value = '1.0.0';
      select.dispatchEvent(new Event('change'));
      await el.updateComplete;
      expect(el.version?.version).to.equal('1.0.0');
    });

    it('keeps the choice, and its tick, when the chosen application is clicked again', async () => {
      await chooseFirstApplication();
      await el.updateComplete;
      expect(el.application?.name).to.equal('BZ');
      expect(q<OscdSelectionList>('#applications').items[0].selected).to.be.true;
      expect(q('#summary')).to.exist;
    });
  });

  describe('assigning IEDs', () => {
    beforeEach(toAssign);

    it('has a row for every function, with what it needs', () => {
      const rows = qa('.function').map(row => row.getAttribute('data-function'));
      expect(rows).to.deep.equal(['Publisher', 'Relay', 'Subscriber']);
    });

    it('offers only IEDs of the right kind and tag, and a way to leave it unassigned', () => {
      const options = (fn: string) =>
        qa(`[data-function="${fn}"] oscd-select-option`).map(o => o.getAttribute('value'));
      expect(options('Publisher')).to.deep.equal(['', 'PUB1', 'PUB2']);
      expect(options('Relay')).to.deep.equal(['', 'SELR']);
      expect(options('Subscriber')).to.deep.equal(['', 'SUB1', 'SUB2']);
    });

    it('does not offer an IED that another function uses', async () => {
      await assign('Publisher', 'PUB1');
      const options = qa('[data-function="Relay"] oscd-select-option');
      expect(options.map(o => o.getAttribute('value'))).to.deep.equal(['', 'SELR']);

      const other = qa('[data-function="Subscriber"] oscd-select-option').map(o =>
        o.getAttribute('value')
      );
      expect(other).to.deep.equal(['', 'SUB1', 'SUB2']);
    });

    it('says why it cannot continue yet', async () => {
      expect(q('#needs-two')).to.exist;
      await assign('Publisher', 'PUB2');
      await assign('Subscriber', 'SUB2');
      expect(q('#needs-two')).to.not.exist;
    });

    it('explains what automatic assignment could not decide, until something changes', async () => {
      await click('#auto');
      expect(q('#auto-note').textContent).to.contain('Publisher').and.contain('Subscriber');
      expect(q('#auto-note').textContent).to.not.contain('Relay');
      expect(el.assignment.get('Relay')).to.equal('SELR');

      await assign('Publisher', 'PUB2');
      expect(q('#auto-note')).to.not.exist;
    });

    it('needs two functions before it can continue', async () => {
      const next = () => q<HTMLElement & { disabled: boolean }>('#next');
      expect(next().disabled).to.be.true;
      await assign('Publisher', 'PUB2');
      expect(next().disabled).to.be.true;
      await assign('Subscriber', 'SUB2');
      expect(next().disabled).to.be.false;
      expect(q('#assigned').textContent).to.contain('2 of 3');
    });

    it('assigns the functions that have exactly one candidate', async () => {
      await click('#auto');
      expect([...el.assignment]).to.deep.equal([['Relay', 'SELR']]);
    });

    it('clears the assignment', async () => {
      await assign('Publisher', 'PUB2');
      await click('#clear');
      expect(el.assignment.size).to.equal(0);
    });

    it('explains when no IED can fill a function', async () => {
      doc.querySelector('IED[name="SELR"]')!.setAttribute('type', 'OTHER');
      el.requestUpdate();
      await el.updateComplete;
      const reason = q('[data-function="Relay"] .reason');
      expect(reason.textContent).to.contain('No SEL SEL-421 IED in this file');
      expect(q('[data-function="Relay"] oscd-outlined-select')).to.be.null;
    });

    it('goes back to choosing without losing the choice', async () => {
      await click('#back');
      expect(el.step).to.equal('choose');
      expect(el.application?.name).to.equal('BZ');
    });
  });

  describe('reviewing', () => {
    beforeEach(toReview);

    it('shows each control block and what will happen to it', () => {
      const rows = qa('#plan tbody tr').map(tr =>
        tr.textContent!.replace(/\s+/g, ' ').trim()
      );
      expect(rows).to.have.lengthOf(2);
      expect(rows[0]).to.contain('PUB2').and.contain('SUB2').and.contain('GC1');
      expect(rows[0]).to.contain('2 New');
      expect(rows[1]).to.contain('SV1');
      expect(q('#plan-summary').textContent!.replace(/\s+/g, ' ')).to.contain(
        '3 new subscriptions · 2 new supervisions · 0 SEL quality links · 0 already present'
      );
    });

    it('names the functions that have no IED and are not applied', () => {
      expect(q('#unassigned').textContent).to.contain('Relay');
    });

    it('plans again when the document was edited while reviewing', async () => {
      el.plan!.edits.forEach((edit: EditV2) => handleEdit(edit));
      el.docVersion = 2;
      await el.updateComplete;
      expect(q('#nothing')).to.exist;
      expect(q<HTMLElement & { disabled: boolean }>('#apply').disabled).to.be.true;
    });

    it('applies nothing that was not shown: a changed document shows the new plan instead', async () => {
      el.plan!.edits.forEach((edit: EditV2) => handleEdit(edit));
      await click('#apply');
      expect(applied).to.be.empty;
      expect(el.step).to.equal('review');
      expect(q('#nothing')).to.exist;
    });

    it('does not change the document before applying', () => {
      expect(
        doc.querySelector('IED[name="SUB2"] ExtRef[intAddr="I1"]')!.hasAttribute('iedName')
      ).to.be.false;
    });

    it('raises one titled event with all the edits, then shows the result', async () => {
      await click('#apply');

      expect(applied).to.have.lengthOf(1);
      expect(applied[0].title).to.equal('Apply stencil BZ 1.0.0');
      applied[0].edits.forEach((edit: EditV2) => handleEdit(edit));
      expect(
        doc.querySelector('IED[name="SUB2"] ExtRef[intAddr="I1"]')!.getAttribute('iedName')
      ).to.equal('PUB2');

      expect(el.step).to.equal('done');
      expect(q('#done').textContent).to.contain('3 subscriptions, 2 supervisions');
      expect(q('#done').textContent).to.contain('undo');
    });

    it('shows the mappings after applying, with the IEDs and what was added', async () => {
      await click('#apply');

      const table = q<HTMLElement & { assignment: Map<string, string>; markers: Map<string, { label: string }> }>(
        'oscd-stencil-mapping-table'
      );
      expect(Object.fromEntries(table.assignment)).to.deep.equal({
        Publisher: 'PUB2',
        Subscriber: 'SUB2'
      });
      expect([...table.markers.values()].map(m => m.label)).to.deep.equal([
        'Added',
        'Added'
      ]);
      const ieds = Array.from(table.shadowRoot!.querySelectorAll('thead .ied')).map(
        e => e.textContent
      );
      expect(ieds).to.deep.equal(['SUB2']);
    });

    it('marks control blocks of a function that was not given an IED as not applied', async () => {
      const version = stencil.applications[0].versions[0];
      version.ControlBlocks.push(
        ...applicationFrom(getMappingInfo(doc, 'PUB1', 'SELR'), 'Publisher', 'Relay')
          .ControlBlocks
      );
      el.stencil = { ...stencil };
      await el.updateComplete;
      el.reset();
      await el.updateComplete;
      await toReview();
      await click('#apply');

      const table = q<HTMLElement & { markers: Map<string, { label: string }> }>(
        'oscd-stencil-mapping-table'
      );
      expect(table.markers.get('Publisher|Relay|GC1')?.label).to.equal('Not applied');
      expect(table.markers.get('Publisher|Subscriber|GC1')?.label).to.equal('Added');
    });

    it('can start again after applying', async () => {
      await click('#apply');
      await click('#another');
      expect(el.step).to.equal('choose');
      expect(el.application).to.be.null;
      expect(el.assignment.size).to.equal(0);
    });

    it('goes back to assigning', async () => {
      await click('#back');
      expect(el.step).to.equal('assign');
      expect(el.assignment.size).to.equal(2);
    });
  });

  describe('when there is nothing to do or something is missing', () => {
    it('says so, and cannot apply, when everything is already in place', async () => {
      await toAssign();
      await assign('Publisher', 'PUB1');
      await assign('Subscriber', 'SUB1');
      await click('#next');

      expect(q('#nothing').textContent).to.contain('nothing to apply');
      expect(q<HTMLElement & { disabled: boolean }>('#apply').disabled).to.be.true;
      expect(q('#plan-summary').textContent).to.contain('5 already present');
    });

    it('lists what could not be found and still applies the rest', async () => {
      stencil.applications[0].versions[0].ControlBlocks[0].mappings[0].FCDA =
        '>>LD0>DS_G>nothing';
      await toReview();

      expect(q('#problems').textContent).to.contain(
        'Could not find FCDA: PUB2>>LD0>DS_G>nothing'
      );
      expect(q<HTMLElement & { disabled: boolean }>('#apply').disabled).to.be.false;
    });
  });

  describe('when the document or stencil changes', () => {
    it('starts again when another document is opened', async () => {
      await toAssign();
      await assign('Publisher', 'PUB2');

      el.doc = buildDocument();
      await el.updateComplete;
      expect(el.step).to.equal('choose');
      expect(el.assignment.size).to.equal(0);
    });

    it('keeps going when the same application is still in a replaced stencil', async () => {
      await toAssign();
      el.stencil = { ...stencil, name: 'Renamed' };
      await el.updateComplete;
      expect(el.step).to.equal('assign');
    });

    it('starts again when the chosen version is gone', async () => {
      await toAssign();
      el.stencil = makeStencil([makeApplication('Line', 'Other', [makeVersion('1.0.0')])]);
      await el.updateComplete;
      expect(el.step).to.equal('choose');
      expect(el.application).to.be.null;
    });
  });
});
