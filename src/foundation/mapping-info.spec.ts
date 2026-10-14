import { expect } from '@open-wc/testing';
import { identity, controlBlockObjRef } from '@openscd/scl-lib';

import { getMappingInfo } from './mapping-info.js';
import { resolveRef, toRef } from './stencil-ref.js';
import { fixtureXml } from '../testing/fixture-scd.js';
import { legacyMappingInfo } from '../testing/golden/legacy-getMappingInfo.js';
import { sclLib013Identities } from '../testing/golden/scl-lib-0.13.3-identities.js';

const doc = new DOMParser().parseFromString(fixtureXml, 'application/xml');

describe('golden: behaviour recorded before the upgrade', () => {
  it('scl-lib 2 identity() matches the 0.13.3 identities for every stencil element type', () => {
    Object.entries(sclLib013Identities.identities).forEach(([selector, expected]) => {
      const actual = Array.from(doc.querySelectorAll(selector)).map(e => String(identity(e)));
      expect(actual, selector).to.deep.equal(expected);
    });
  });

  it('controlBlockObjRef() matches 0.13.3', () => {
    const actual = Array.from(doc.querySelectorAll('GSEControl, SampledValueControl')).map(
      e => controlBlockObjRef(e)
    );
    expect(actual).to.deep.equal(sclLib013Identities.objRef);
  });

  // PUB1->EDN1 is where the old code was wrong (defect 11), see the cases below.
  Object.entries(legacyMappingInfo)
    .filter(([pair]) => !pair.endsWith('EDN1'))
    .forEach(([pair, expected]) => {
      it(`getMappingInfo ${pair} is unchanged`, () => {
        const [from, to] = pair.split('->');
        expect(getMappingInfo(doc, from, to)).to.deep.equal(expected);
      });
    });
});

describe('getMappingInfo', () => {
  let doc: XMLDocument;

  beforeEach(() => {
    doc = new DOMParser().parseFromString(fixtureXml, 'application/xml');
  });

  const addExtRef = (ied: string, xml: string): void => {
    const inputs = doc.querySelector(`IED[name="${ied}"] Inputs`)!;
    const holder = new DOMParser().parseFromString(
      `<r xmlns="${doc.documentElement.namespaceURI}">${xml}</r>`,
      'application/xml'
    );
    inputs.appendChild(doc.importNode(holder.documentElement.firstElementChild!, true));
  };

  describe('an ExtRef without serviceType', () => {
    it('is recorded only against the control block holding its data, not every control block of the publisher', () => {
      const mapping = getMappingInfo(doc, 'PUB1', 'EDN1');
      expect(mapping.map(cb => cb.id)).to.deep.equal(['>>LD0>GC2']);
      expect(mapping[0].mappings).to.deep.equal([
        {
          FCDA: '>>LD0>DS_G2>LD0/ GGIO 1.Ind3 stVal (ST)',
          ExtRef: '>>LD0>#0'
        }
      ]);
    });

    it('never produces a mapping with no FCDA', () => {
      doc.querySelectorAll('IED').forEach(from =>
        doc.querySelectorAll('IED').forEach((to) => {
          getMappingInfo(doc, from.getAttribute('name')!, to.getAttribute('name')!).forEach(
            cb => cb.mappings.forEach(m => expect(m.FCDA).to.not.equal('NONE'))
          );
        })
      );
    });
  });

  describe('SEL message quality', () => {
    beforeEach(() => {
      // SELR is also subscribed to GC2, which has its own quality ExtRef Q_GC2
      addExtRef(
        'SELR',
        '<ExtRef intAddr="S2" iedName="PUB1" ldInst="LD0" lnClass="GGIO" lnInst="1" doName="Ind3" daName="stVal" serviceType="GOOSE" srcCBName="GC2" srcLDInst="LD0" srcLNClass="LLN0"/>'
      );
    });

    it('gives each control block its own quality ExtRef', () => {
      const [gc1, gc2] = getMappingInfo(doc, 'PUB1', 'SELR');
      expect(gc1.selSupervision?.name).to.equal('Q_GC1');
      expect(gc2.selSupervision?.name).to.equal('Q_GC2');
    });

    it('finds no quality ExtRef for another manufacturer or when asked not to', () => {
      doc.querySelector('IED[name="SELR"]')!.setAttribute('manufacturer', 'OTHER');
      expect(getMappingInfo(doc, 'PUB1', 'SELR').every(cb => !cb.selSupervision)).to.be.true;

      doc.querySelector('IED[name="SELR"]')!.setAttribute('manufacturer', 'SEL');
      expect(getMappingInfo(doc, 'PUB1', 'SELR', false).every(cb => !cb.selSupervision)).to.be.true;
    });

    it('does not take a quality ExtRef that is already subscribed', () => {
      const quality = doc.querySelector('ExtRef[intAddr="Q_GC1"]')!;
      ['ldInst', 'lnClass', 'lnInst', 'doName'].forEach((name, i) =>
        quality.setAttribute(name, ['LD0', 'GGIO', '1', 'Ind1'][i])
      );
      expect(getMappingInfo(doc, 'PUB1', 'SELR')[0].selSupervision).to.be.undefined;
    });
  });

  describe('missing or odd input', () => {
    it('has no mappings for an IED that does not exist', () => {
      expect(getMappingInfo(doc, 'NOPE', 'SUB1')).to.deep.equal([]);
      expect(getMappingInfo(doc, 'PUB1', 'NOPE')).to.deep.equal([]);
    });

    it('is not confused by names that are not safe in a selector', () => {
      expect(getMappingInfo(doc, 'PUB1"]', 'SUB1')).to.deep.equal([]);
      expect(getMappingInfo(doc, 'PUB1', "SUB1' > *")).to.deep.equal([]);
    });

    it('skips a subscription whose data is not in the control block data set', () => {
      doc.querySelector('DataSet[name="DS_G"] FCDA[doName="Ind2"]')!.remove();
      const mapping = getMappingInfo(doc, 'PUB1', 'SUB1')[0];
      expect(mapping.mappings.map(m => m.ExtRef)).to.deep.equal(['>>LD0>I1[0]']);
    });

    it('records nothing for a control block without a data set', () => {
      doc.querySelector('GSEControl[name="GC1"]')!.removeAttribute('datSet');
      expect(getMappingInfo(doc, 'PUB1', 'SUB1').map(cb => cb.name)).to.deep.equal(['SV1']);
    });

    it('reports no supervision when the subscriber has none for the control block', () => {
      doc.querySelector('IED[name="SUB1"] LN[lnClass="LGOS"] Val')!.textContent = 'other';
      expect(getMappingInfo(doc, 'PUB1', 'SUB1')[0].supervision).to.equal('None');
    });
  });

  describe('stored references', () => {
    const tagOf = (type: string) =>
      type === 'GSEControl' || type === 'SampledValueControl' ? type : 'GSEControl';

    /** EDN1 gets a second ExtRef without intAddr, so positions 0 and 1 both exist. */
    const withTwoPositionalExtRefs = (): XMLDocument => {
      addExtRef(
        'EDN1',
        '<ExtRef iedName="PUB1" ldInst="LD0" lnClass="GGIO" lnInst="1" doName="Ind1" daName="stVal"/>'
      );
      return doc;
    };

    it('stores an ExtRef without intAddr by its position among such ExtRefs', () => {
      withTwoPositionalExtRefs();
      const byId = Object.fromEntries(
        getMappingInfo(doc, 'PUB1', 'EDN1').map(cb => [cb.name, cb.mappings[0].ExtRef])
      );
      expect(byId).to.deep.equal({ GC1: '>>LD0>#1', GC2: '>>LD0>#0' });
    });

    it('resolves every stored reference to the element it came from, for every IED pair', () => {
      withTwoPositionalExtRefs();
      const names = Array.from(doc.querySelectorAll(':root > IED')).map(ied => ied.getAttribute('name')!);
      let checked = 0;

      names.forEach(from =>
        names.forEach((to) => {
          getMappingInfo(doc, from, to).forEach((cb) => {
            expect(resolveRef(doc, tagOf(cb.type) as 'GSEControl', from, cb.id), cb.id).to.equal(
              doc.querySelector(`IED[name="${from}"] ${cb.type}[name="${cb.name}"]`)
            );
            cb.mappings.forEach((mapping) => {
              expect(resolveRef(doc, 'FCDA', from, mapping.FCDA), mapping.FCDA).to.exist;
              expect(resolveRef(doc, 'ExtRef', to, mapping.ExtRef), mapping.ExtRef).to.exist;
              checked += 2;
            });
            if (cb.supervision !== 'None') {
              expect(resolveRef(doc, 'LN', to, cb.supervision), cb.supervision).to.exist;
            }
            if (cb.selSupervision) {
              expect(resolveRef(doc, 'ExtRef', to, cb.selSupervision.ExtRef)).to.exist;
            }
          });
        })
      );
      expect(checked).to.be.greaterThan(8);
    });

    it('finds the same ExtRef again after capture, whatever its position', () => {
      withTwoPositionalExtRefs();
      getMappingInfo(doc, 'PUB1', 'EDN1').forEach(cb =>
        cb.mappings.forEach((mapping) => {
          const extRef = resolveRef(doc, 'ExtRef', 'EDN1', mapping.ExtRef)!;
          expect(toRef(extRef)).to.equal(mapping.ExtRef);
        })
      );
    });
  });
});

