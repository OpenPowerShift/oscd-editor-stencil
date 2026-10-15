import { expect } from '@open-wc/testing';
import { handleEdit } from '@omicronenergy/oscd-editor';

import { iedSelectItems, visibleItems } from './ied-items.js';
import { tagIedEdits } from './ied-tags.js';
import { fixtureXml } from '../testing/fixture-scd.js';

describe('iedSelectItems', () => {
  let doc: XMLDocument;

  beforeEach(() => {
    doc = new DOMParser().parseFromString(fixtureXml, 'application/xml');
  });

  it('is empty without a document', () => {
    expect(iedSelectItems(undefined)).to.be.empty;
  });

  it('lists every IED unselected, with name, manufacturer and type', () => {
    const items = iedSelectItems(doc);
    expect(items.map(item => item.headline)).to.deep.equal([
      'PUB1 — SIEMENS - 7SS85',
      'SUB1 — SIEMENS - 6MU85',
      'SELR — SEL - SEL-421',
      'EDN1 — OTHER - X1'
    ]);
    expect(items.every(item => item.selected === false)).to.be.true;
    expect(items[0].attachedElement).to.equal(
      doc.querySelector('IED[name="PUB1"]')
    );
  });

  it('only lists IEDs directly under the SCL root', () => {
    const nested = doc.createElementNS(doc.documentElement.namespaceURI, 'IED');
    nested.setAttribute('name', 'NESTED');
    doc.querySelector('Server')!.appendChild(nested);
    expect(iedSelectItems(doc)).to.have.lengthOf(4);
  });

  it('shows the stencil tag only when asked to', () => {
    const ied = doc.querySelector('IED[name="SUB1"]')!;
    tagIedEdits(ied, 'BZ', '1.0.0').forEach(edit => handleEdit(edit));

    expect(iedSelectItems(doc)[1].supportingText).to.equal('Subscriber');
    expect(iedSelectItems(doc, true)[1].supportingText).to.equal(
      'Subscriber [BZ, 1.0.0]'
    );
  });

  it('returns new objects each time so a selection can be cleared', () => {
    const first = iedSelectItems(doc);
    first[0].selected = true;
    expect(iedSelectItems(doc)[0].selected).to.be.false;
  });

  it('finds the items a list shows for its search', () => {
    const items = [
      { headline: 'PUB1', supportingText: 'Publisher' },
      { headline: 'SUB1', supportingText: 'Subscriber' }
    ];
    expect(visibleItems({ searchRegex: /pub/i }, items)).to.deep.equal([items[0]]);
    expect(visibleItems({}, items)).to.deep.equal(items);
    expect(visibleItems(null, items)).to.deep.equal(items);
  });
});
