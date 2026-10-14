import { expect } from '@open-wc/testing';

import {
  findFcda,
  findIed,
  inputsOf,
  isSubscribed,
  isSubscribedTo,
  matchSrcAttributes
} from './match.js';
import { fixtureXml } from '../testing/fixture-scd.js';

describe('match', () => {
  let doc: XMLDocument;
  let gc1: Element;
  let gc2: Element;
  let sv1: Element;

  const extRef = (attributes: Record<string, string>): Element => {
    const element = doc.createElementNS(doc.documentElement.namespaceURI, 'ExtRef');
    Object.entries(attributes).forEach(([name, value]) =>
      element.setAttribute(name, value)
    );
    return element;
  };

  beforeEach(() => {
    doc = new DOMParser().parseFromString(fixtureXml, 'application/xml');
    gc1 = doc.querySelector('GSEControl[name="GC1"]')!;
    gc2 = doc.querySelector('GSEControl[name="GC2"]')!;
    sv1 = doc.querySelector('SampledValueControl[name="SV1"]')!;
  });

  describe('findIed and inputsOf', () => {
    it('finds an IED by name, including names that are not safe in a selector', () => {
      expect(findIed(doc, 'PUB1')?.getAttribute('name')).to.equal('PUB1');
      expect(findIed(doc, 'PUB1"]')).to.be.undefined;
      expect(findIed(doc, 'nope')).to.be.undefined;
    });

    it('lists the ExtRefs of an IED', () => {
      expect(inputsOf(findIed(doc, 'SUB1')!)).to.have.lengthOf(4);
      expect(inputsOf(findIed(doc, 'PUB1')!)).to.be.empty;
    });
  });

  it('isSubscribed needs the whole data reference', () => {
    expect(isSubscribed(extRef({ iedName: 'A', ldInst: 'L', lnClass: 'C', lnInst: '1', doName: 'D' }))).to.be.true;
    expect(isSubscribed(extRef({ iedName: 'A', ldInst: 'L', lnClass: 'C', lnInst: '1' }))).to.be.false;
    expect(isSubscribed(extRef({ intAddr: 'I' }))).to.be.false;
  });

  describe('matchSrcAttributes', () => {
    const src = { iedName: 'PUB1', srcCBName: 'GC1', srcLDInst: 'LD0', srcLNClass: 'LLN0' };

    it('matches the control block the source attributes point at', () => {
      expect(matchSrcAttributes(extRef({ ...src, serviceType: 'GOOSE' }), gc1)).to.be.true;
    });

    it('does not require a service type', () => {
      expect(matchSrcAttributes(extRef(src), gc1)).to.be.true;
    });

    it('still checks every other source attribute without a service type', () => {
      expect(matchSrcAttributes(extRef(src), gc2), 'other control block').to.be.false;
      expect(matchSrcAttributes(extRef({ ...src, srcLDInst: 'LD1' }), gc1), 'ldInst').to.be.false;
      expect(matchSrcAttributes(extRef({ ...src, srcLNClass: 'GGIO' }), gc1), 'lnClass').to.be.false;
      expect(matchSrcAttributes(extRef({ ...src, srcPrefix: 'x' }), gc1), 'prefix').to.be.false;
      expect(matchSrcAttributes(extRef({ ...src, srcLNInst: '1' }), gc1), 'lnInst').to.be.false;
    });

    it('rejects a service type that is not the control block type', () => {
      expect(matchSrcAttributes(extRef({ ...src, serviceType: 'SMV' }), gc1)).to.be.false;
      expect(matchSrcAttributes(extRef({ ...src, srcCBName: 'SV1', serviceType: 'SMV' }), sv1)).to.be.true;
    });

    it('takes the logical device from ldInst when srcLDInst is missing', () => {
      const { srcLDInst, ...rest } = src;
      expect(srcLDInst).to.equal('LD0');
      expect(matchSrcAttributes(extRef({ ...rest, ldInst: 'LD0' }), gc1)).to.be.true;
      expect(matchSrcAttributes(extRef(rest), gc1)).to.be.false;
    });

    it('takes LLN0 as the source class when srcLNClass is missing', () => {
      const { srcLNClass, ...rest } = src;
      expect(srcLNClass).to.equal('LLN0');
      expect(matchSrcAttributes(extRef(rest), gc1)).to.be.true;
    });
  });

  describe('findFcda', () => {
    const data = { iedName: 'PUB1', ldInst: 'LD0', lnClass: 'GGIO', lnInst: '1', doName: 'Ind1', daName: 'stVal' };

    it('finds the FCDA in the control block data set', () => {
      expect(findFcda(gc1, extRef(data))?.getAttribute('doName')).to.equal('Ind1');
    });

    it('finds nothing in another control block, or without a data set', () => {
      expect(findFcda(gc2, extRef(data))).to.be.undefined;
      const orphan = gc1.cloneNode() as Element;
      orphan.removeAttribute('datSet');
      expect(findFcda(orphan, extRef(data))).to.be.undefined;
    });

    it('finds nothing when the data set does not exist', () => {
      const dangling = gc1.cloneNode() as Element;
      dangling.setAttribute('datSet', 'MISSING');
      gc1.parentElement!.appendChild(dangling);
      expect(findFcda(dangling, extRef(data))).to.be.undefined;
    });
  });

  describe('isSubscribedTo', () => {
    const edition1 = { iedName: 'PUB1', ldInst: 'LD0', lnClass: 'GGIO', lnInst: '1', doName: 'Ind3', daName: 'stVal' };

    it('uses the source attributes when there are any', () => {
      const withSrc = extRef({ ...edition1, srcCBName: 'GC1', srcLDInst: 'LD0', srcLNClass: 'LLN0', serviceType: 'GOOSE' });
      expect(isSubscribedTo(withSrc, gc1)).to.be.true;
      expect(isSubscribedTo(withSrc, gc2)).to.be.false;
    });

    it('uses the data set when there is no srcCBName, so only the control block holding the data matches', () => {
      const ed1 = extRef(edition1);
      expect(isSubscribedTo(ed1, gc2)).to.be.true;
      expect(isSubscribedTo(ed1, gc1)).to.be.false;
      expect(isSubscribedTo(ed1, sv1)).to.be.false;
    });

    it('does not match the data of a control block of another service type', () => {
      const smvData = extRef({ iedName: 'PUB1', ldInst: 'LD0', lnClass: 'TCTR', lnInst: '1', doName: 'AmpSv', daName: 'instMag.i', serviceType: 'GOOSE' });
      expect(isSubscribedTo(smvData, sv1)).to.be.false;
      smvData.setAttribute('serviceType', 'SMV');
      expect(isSubscribedTo(smvData, sv1)).to.be.true;
    });
  });
});
