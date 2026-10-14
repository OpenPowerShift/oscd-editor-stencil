import { expect } from '@open-wc/testing';

import {
  blockKey,
  buildVersion,
  checkState,
  discoverControlBlocks,
  functionNameProblems,
  involvedIeds,
  setChosen,
  suggestFunctionNames,
  untaggedIeds
} from './capture.js';
import { tagIedEdits } from './ied-tags.js';
import { handleEdit } from '@omicronenergy/oscd-editor';
import { fixtureXml } from '../testing/fixture-scd.js';

const load = () => new DOMParser().parseFromString(fixtureXml, 'application/xml');

describe('capture', () => {
  it('finds the control blocks one IED sends to another, in both directions', () => {
    const doc = load();
    const blocks = discoverControlBlocks(doc, ['PUB1', 'SUB1']);
    expect(blocks.length).to.be.greaterThan(0);
    expect(blocks.every(b => b.from === 'PUB1' && b.to === 'SUB1')).to.be.true;
    expect(discoverControlBlocks(doc, ['SUB1', 'PUB1'])).to.have.lengthOf(blocks.length);
    expect(discoverControlBlocks(doc, ['PUB1'])).to.deep.equal([]);
    expect(involvedIeds(blocks)).to.deep.equal(['PUB1', 'SUB1']);
  });

  it('tracks what is chosen per row, column or cell', () => {
    const blocks = discoverControlBlocks(load(), ['PUB1', 'SUB1']);
    const none = new Set<string>();
    expect(checkState(blocks, none)).to.equal('none');

    const all = setChosen(none, blocks, true);
    expect(checkState(blocks, all)).to.equal('all');

    const some = setChosen(all, [blocks[0]], false);
    expect(checkState(blocks, some)).to.equal('some');
    expect(some.has(blockKey(blocks[0]))).to.be.false;
    expect(all.has(blockKey(blocks[0]))).to.be.true;
    expect(checkState(blocks, setChosen(some, blocks, false))).to.equal('none');
  });

  it('suggests the IED names and finds problems with function names', () => {
    expect(suggestFunctionNames(['A', 'B'])).to.deep.equal({ A: 'A', B: 'B' });
    expect(functionNameProblems({ A: 'x', B: 'y' })).to.deep.equal({});
    expect(Object.keys(functionNameProblems({ A: 'x', B: ' x ' }))).to.deep.equal(['A', 'B']);
    expect(Object.keys(functionNameProblems({ A: ' ', B: 'y' }))).to.deep.equal(['A']);
  });

  it('lists IEDs without a stencil tag', () => {
    const doc = load();
    expect(untaggedIeds(doc, ['PUB1', 'SUB1', 'Nope'])).to.deep.equal(['PUB1', 'SUB1']);
    tagIedEdits(doc.querySelector('IED[name="PUB1"]')!, 'P', '1.0.0').forEach(e => handleEdit(e));
    expect(untaggedIeds(doc, ['PUB1', 'SUB1'])).to.deep.equal(['SUB1']);
  });

  it('builds a version whose functions replace the IED names and require what the IEDs are', () => {
    const doc = load();
    tagIedEdits(doc.querySelector('IED[name="PUB1"]')!, 'P', '1.0.0').forEach(e => handleEdit(e));
    const blocks = discoverControlBlocks(doc, ['PUB1', 'SUB1']);
    const version = buildVersion(
      doc,
      blocks,
      { PUB1: 'Publisher', SUB1: ' Subscriber ' },
      { version: ' 1.0.0 ', description: 'd', deprecated: false }
    );

    expect(version.version).to.equal('1.0.0');
    expect(Object.keys(version.IEDS)).to.deep.equal(['Publisher', 'Subscriber']);
    expect(version.IEDS.Publisher).to.include({ originalName: 'PUB1', manufacturer: 'SIEMENS' });
    expect(version.IEDS.Publisher.privates).to.deep.equal([
      { 'OpenSCD-Stencil-Id': 'P', 'OpenSCD-Stencil-Version': '1.0.0' }
    ]);
    expect(version.IEDS.Subscriber.privates).to.deep.equal([]);
    expect(version.ControlBlocks.every(b => b.from === 'Publisher' && b.to === 'Subscriber')).to.be.true;
  });

  it('skips an IED that is not in the document', () => {
    const doc = load();
    const blocks = [{ ...discoverControlBlocks(doc, ['PUB1', 'SUB1'])[0], to: 'GONE' }];
    const version = buildVersion(doc, blocks, {}, { version: '1', description: '', deprecated: false });
    expect(Object.keys(version.IEDS)).to.deep.equal(['PUB1']);
  });
});
