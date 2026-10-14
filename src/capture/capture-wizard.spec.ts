import { expect, fixture, html } from '@open-wc/testing';
import { handleEdit } from '@omicronenergy/oscd-editor';
import type { OscdCheckbox } from '@omicronenergy/oscd-ui/checkbox/OscdCheckbox.js';
import type { OscdOutlinedTextField } from '@omicronenergy/oscd-ui/textfield/OscdOutlinedTextField.js';
import type { OscdSelectionList } from '@omicronenergy/oscd-ui/selection-list/OscdSelectionList.js';

import { OscdStencilCapture } from './capture-wizard.js';
import type { StencilCaptureDetail } from './capture-wizard.js';
import { blockKey, discoverControlBlocks } from '../foundation/capture.js';
import { tagIedEdits } from '../foundation/ied-tags.js';
import type { StencilData } from '../foundation/types.js';
import { fixtureXml } from '../testing/fixture-scd.js';
import { makeApplication, makeStencil, makeVersion } from '../testing/stencils.js';

customElements.define('oscd-stencil-capture', OscdStencilCapture);

describe('oscd-stencil-capture', () => {
  let el: OscdStencilCapture;
  let doc: XMLDocument;
  let stencil: StencilData;
  let captured: StencilCaptureDetail[];
  let tagRequests: number;

  const q = <T extends Element>(selector: string) =>
    el.shadowRoot!.querySelector(selector) as T;

  const click = async (selector: string) => {
    expect(q(selector), selector).to.exist;
    q<HTMLElement>(selector).click();
    await el.updateComplete;
  };

  const chooseIeds = async (...names: string[]) => {
    const list = q<OscdSelectionList>('#ieds');
    list.items.forEach((item) => {
      item.selected = names.includes(item.attachedElement!.getAttribute('name')!);
    });
    list.dispatchEvent(new CustomEvent('selection-list-change'));
    await el.updateComplete;
  };

  const type = async (selector: string, value: string) => {
    const field = q<OscdOutlinedTextField>(selector);
    expect(field, selector).to.exist;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    await el.updateComplete;
  };

  const toBlocks = async () => {
    await chooseIeds('PUB1', 'SUB1');
    await click('#next');
  };

  const toDetails = async () => {
    await toBlocks();
    await click('#next');
  };

  const fillDetails = async () => {
    await type('#category', 'Bus');
    await type('#name', 'BZ');
    await type('#version', '1.0.0');
  };

  const toReview = async () => {
    await toDetails();
    await fillDetails();
    await click('#next');
  };

  beforeEach(async () => {
    doc = new DOMParser().parseFromString(fixtureXml, 'application/xml');
    stencil = makeStencil();
    el = await fixture(
      html`<oscd-stencil-capture .doc=${doc} .stencil=${stencil}></oscd-stencil-capture>`
    );
    captured = [];
    tagRequests = 0;
    el.addEventListener('stencil-capture', e =>
      captured.push((e as CustomEvent<StencilCaptureDetail>).detail)
    );
    el.addEventListener('stencil-tag', () => (tagRequests += 1));
  });

  afterEach(() => el.remove());

  it('asks for a document when none is open', async () => {
    const bare = await fixture<OscdStencilCapture>(
      html`<oscd-stencil-capture .stencil=${stencil}></oscd-stencil-capture>`
    );
    expect(bare.shadowRoot!.textContent).to.contain('Please open a file');
  });

  describe('selecting IEDs', () => {
    it('offers every IED and needs two of them', async () => {
      expect(q<OscdSelectionList>('#ieds').items).to.have.lengthOf(4);
      expect(q<HTMLButtonElement>('#next').disabled).to.be.true;

      await chooseIeds('PUB1');
      expect(q<HTMLButtonElement>('#next').disabled).to.be.true;

      await chooseIeds('PUB1', 'SUB1');
      expect(q<HTMLButtonElement>('#next').disabled).to.be.false;
    });

    it('says so when the IEDs are not subscribed to one another', async () => {
      expect(discoverControlBlocks(doc, ['SUB1', 'SELR'])).to.deep.equal([]);
      await chooseIeds('SUB1', 'SELR');
      await click('#next');
      expect(q('#none')).to.exist;
      await click('#back');
      expect(q('#ieds')).to.exist;
    });
  });

  describe('selecting control blocks', () => {
    beforeEach(toBlocks);

    const checkbox = (id: string) => q<OscdCheckbox>(`#${CSS.escape(id)}`);
    const tick = async (id: string, checked: boolean) => {
      const box = checkbox(id);
      expect(box, id).to.exist;
      box.checked = checked;
      box.dispatchEvent(new Event('change'));
      await el.updateComplete;
    };

    it('starts with every control block chosen', () => {
      const blocks = discoverControlBlocks(doc, ['PUB1', 'SUB1']);
      expect(el.chosen.size).to.equal(blocks.length);
      expect(checkbox('ied-PUB1').checked).to.be.true;
      expect(checkbox('col-SUB1').checked).to.be.true;
    });

    it('unticks one cell, which leaves its row, column and IED partly ticked', async () => {
      const [first] = discoverControlBlocks(doc, ['PUB1', 'SUB1']);
      await tick(`cell-${blockKey(first)}`, false);

      expect(el.chosen.has(blockKey(first))).to.be.false;
      expect(checkbox('ied-PUB1').indeterminate).to.be.true;
      expect(checkbox('col-SUB1').indeterminate).to.be.true;
    });

    it('unticks and reticks everything from an IED, a column or a row', async () => {
      await tick('ied-PUB1', false);
      expect(el.chosen.size).to.equal(0);
      expect(q<HTMLButtonElement>('#next').disabled).to.be.true;

      await tick('col-SUB1', true);
      expect(el.chosen.size).to.be.greaterThan(0);

      const [first] = discoverControlBlocks(doc, ['PUB1', 'SUB1']);
      await tick(`row-PUB1-${first.id}`, false);
      expect(el.chosen.has(blockKey(first))).to.be.false;
    });

    it('goes back to the IEDs, keeping what was chosen', async () => {
      await click('#back');
      expect(q<OscdSelectionList>('#ieds').items.filter(i => i.selected)).to.have.lengthOf(2);
    });
  });

  describe('naming', () => {
    beforeEach(toDetails);

    it('suggests the IED names as function names, and needs the application details', async () => {
      expect(q<OscdOutlinedTextField>('[data-ied="PUB1"]').value).to.equal('PUB1');
      expect(q<OscdOutlinedTextField>('[data-ied="PUB1"]').label).to.equal('Function for PUB1');
      expect(q<HTMLButtonElement>('#next').disabled).to.be.true;
      await fillDetails();
      expect(q<HTMLButtonElement>('#next').disabled).to.be.false;
    });

    it('refuses empty or repeated function names, explaining which', async () => {
      await fillDetails();
      await type('[data-ied="SUB1"]', 'PUB1');
      expect(q<HTMLButtonElement>('#next').disabled).to.be.true;
      expect(q<OscdOutlinedTextField>('[data-ied="SUB1"]').error).to.be.true;
      expect(q<OscdOutlinedTextField>('[data-ied="SUB1"]').errorText).to.contain('different');

      await type('[data-ied="SUB1"]', ' ');
      expect(q<OscdOutlinedTextField>('[data-ied="SUB1"]').errorText).to.contain('needed');

      await type('[data-ied="SUB1"]', 'Subscriber');
      expect(q<HTMLButtonElement>('#next').disabled).to.be.false;
    });

    it('keeps names already typed when coming back', async () => {
      await type('[data-ied="PUB1"]', 'Publisher');
      await click('#back');
      await click('#next');
      expect(q<OscdOutlinedTextField>('[data-ied="PUB1"]').value).to.equal('Publisher');
    });
  });

  describe('reviewing and saving', () => {
    it('shows the mappings, counts and a warning about IEDs without tags, which can be tagged', async () => {
      await toReview();
      expect(q('#review').textContent).to.contain('Bus › BZ');
      expect(q('oscd-stencil-mapping-table')).to.exist;
      expect(q('#untagged').textContent).to.contain('PUB1, SUB1');

      await click('#tag');
      expect(tagRequests).to.equal(1);
    });

    it('has no warning when the IEDs are tagged', async () => {
      ['PUB1', 'SUB1'].forEach(name =>
        tagIedEdits(doc.querySelector(`IED[name="${name}"]`)!, name, '1.0.0').forEach(e =>
          handleEdit(e)
        )
      );
      await toReview();
      expect(q('#untagged')).to.not.exist;
    });

    it('saves the application into a copy of the stencil, and offers to capture another', async () => {
      await toDetails();
      await fillDetails();
      await type('#description', 'About');
      await type('[data-ied="PUB1"]', 'Publisher');
      await click('#next');
      await click('#save');

      expect(captured).to.have.lengthOf(1);
      const [{ stencil: next, category, name, version }] = captured;
      expect([category, name, version]).to.deep.equal(['Bus', 'BZ', '1.0.0']);
      expect(next.applications[0].description).to.equal('About');
      expect(Object.keys(next.applications[0].versions[0].IEDS)).to.deep.equal(['Publisher', 'SUB1']);
      expect(stencil.applications).to.be.empty;
      expect(q('#done')).to.exist;

      await click('#another');
      expect(q('#ieds')).to.exist;
      expect(el.details.name).to.equal('');
    });

    it('needs confirmation to replace a version that exists', async () => {
      el.stencil = makeStencil([makeApplication('Bus', 'BZ', [makeVersion('1.0.0')])]);
      await toReview();
      expect(q('#exists')).to.exist;
      expect(q<HTMLButtonElement>('#save').disabled).to.be.true;

      const box = q<OscdCheckbox>('#replace');
      box.checked = true;
      box.dispatchEvent(new Event('change'));
      await el.updateComplete;
      expect(q<HTMLButtonElement>('#save').disabled).to.be.false;

      await click('#save');
      expect(captured[0].stencil.applications[0].versions).to.have.lengthOf(1);
      expect(captured[0].stencil.applications[0].versions[0].IEDS).to.have.property('PUB1');
    });

    it('goes back to the names', async () => {
      await toReview();
      await click('#back');
      expect(q('#category')).to.exist;
    });
  });

  it('starts again when another document is loaded', async () => {
    await toBlocks();
    el.doc = new DOMParser().parseFromString(fixtureXml, 'application/xml');
    await el.updateComplete;
    expect(q('#ieds')).to.exist;
    expect(el.chosen.size).to.equal(0);
  });
});
