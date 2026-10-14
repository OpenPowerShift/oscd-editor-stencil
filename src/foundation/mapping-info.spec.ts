import { expect } from '@open-wc/testing';
import { identity, controlBlockObjRef } from '@openenergytools/scl-lib';

import { getMappingInfo } from './mapping-info.js';
import { fixtureXml } from '../testing/fixture-scd.js';
import { legacyMappingInfo } from '../testing/golden/legacy-getMappingInfo.js';
import { sclLib013Identities } from '../testing/golden/scl-lib-0.13.3-identities.js';

const doc = new DOMParser().parseFromString(fixtureXml, 'application/xml');

describe('golden: behaviour recorded before the upgrade', () => {
  it('identity() still matches scl-lib 0.13.3 for every stencil element type', () => {
    Object.entries(sclLib013Identities.identities).forEach(([selector, expected]) => {
      const actual = Array.from(doc.querySelectorAll(selector)).map(e => String(identity(e)));
      expect(actual, selector).to.deep.equal(expected);
    });
  });

  it('controlBlockObjRef() is unchanged', () => {
    const actual = Array.from(doc.querySelectorAll('GSEControl, SampledValueControl')).map(
      e => controlBlockObjRef(e)
    );
    expect(actual).to.deep.equal(sclLib013Identities.objRef);
  });

  Object.entries(legacyMappingInfo).forEach(([pair, expected]) => {
    it(`getMappingInfo ${pair} is unchanged`, () => {
      const [from, to] = pair.split('->');
      expect(getMappingInfo(doc, from, to)).to.deep.equal(expected);
    });
  });
});
