import { expect } from '@open-wc/testing';

import { getMappingInfo } from './mapping-info.js';
import { positionalExtRefs } from './review.js';
import { isPositionalRef } from './stencil-ref.js';
import { fixtureXml } from '../testing/fixture-scd.js';

describe('positional references', () => {
  const doc = new DOMParser().parseFromString(fixtureXml, 'application/xml');

  it('recognises the position form and nothing else', () => {
    expect(isPositionalRef('>>LD0>#0')).to.be.true;
    expect(isPositionalRef('>>LD0>#12')).to.be.true;
    expect(isPositionalRef('>>LD0>I1[0]')).to.be.false;
    expect(isPositionalRef('>>LD0>#x')).to.be.false;
    expect(isPositionalRef('>>LD0>#0 more')).to.be.false;
  });

  it('lists the ExtRefs that are matched by position', () => {
    expect(positionalExtRefs(getMappingInfo(doc, 'PUB1', 'EDN1'))).to.deep.equal([
      { controlBlock: 'GC2', from: 'PUB1', to: 'EDN1', extRef: '>>LD0>#0' }
    ]);
  });

  it('lists nothing when every ExtRef has an intAddr', () => {
    expect(positionalExtRefs(getMappingInfo(doc, 'PUB1', 'SUB1'))).to.be.empty;
    expect(positionalExtRefs(getMappingInfo(doc, 'PUB1', 'SELR'))).to.be.empty;
  });

  it('includes a SEL quality ExtRef that has no intAddr', () => {
    const copy = new DOMParser().parseFromString(fixtureXml, 'application/xml');
    copy.querySelector('ExtRef[intAddr="Q_GC1"]')!.removeAttribute('intAddr');
    const found = positionalExtRefs(getMappingInfo(copy, 'PUB1', 'SELR'));
    expect(found.map(ref => ref.extRef)).to.deep.equal(['>>LD0>#0']);
  });
});
