import { expect } from '@open-wc/testing';
import { identity } from '@openscd/scl-lib';

import { resolveRef, toRef } from './stencil-ref.js';
import { fixtureXml } from '../testing/fixture-scd.js';

const doc = () => new DOMParser().parseFromString(fixtureXml, 'application/xml');
const one = (d: XMLDocument, selector: string) => d.querySelector(selector)!;

describe('stencil-ref', () => {
  describe('toRef', () => {
    it('is the scl-lib identity without the IED name', () => {
      const d = doc();
      const gc1 = one(d, 'IED[name="PUB1"] GSEControl[name="GC1"]');
      expect(toRef(gc1)).to.equal(`${identity(gc1)}`.substring('PUB1'.length));
      expect(toRef(gc1)).to.equal('>>LD0>GC1');
    });

    it('keeps an ExtRef with intAddr stable whatever it is subscribed to', () => {
      const d = doc();
      const i1 = one(d, 'IED[name="SUB1"] ExtRef[intAddr="I1"]');
      expect(toRef(i1)).to.equal('>>LD0>I1[0]');
    });

    it('stores an ExtRef without intAddr by position in its Inputs', () => {
      const d = doc();
      const extRef = one(d, 'IED[name="EDN1"] ExtRef');
      expect(toRef(extRef)).to.equal('>>LD0>#0');
    });

    it('counts only siblings without intAddr when positioning', () => {
      const d = doc();
      const inputs = one(d, 'IED[name="EDN1"] Inputs');
      const first = d.createElementNS(inputs.namespaceURI, 'ExtRef');
      first.setAttribute('intAddr', 'X');
      inputs.insertBefore(first, inputs.firstChild);
      expect(toRef(one(d, 'IED[name="EDN1"] ExtRef:not([intAddr])'))).to.equal(
        '>>LD0>#0'
      );
    });
  });

  describe('resolveRef', () => {
    it('resolves every reference to the element it came from', () => {
      const d = doc();
      const cases: [Parameters<typeof resolveRef>[1], string, string][] = [
        ['GSEControl', 'PUB1', 'GSEControl[name="GC2"]'],
        ['SampledValueControl', 'PUB1', 'SampledValueControl'],
        ['FCDA', 'PUB1', 'DataSet[name="DS_S"] FCDA'],
        ['ExtRef', 'SUB1', 'ExtRef[intAddr="I3"]'],
        ['LN', 'SUB1', 'LN[lnClass="LSVS"]'],
        ['ExtRef', 'EDN1', 'ExtRef']
      ];
      cases.forEach(([tag, ied, selector]) => {
        const element = one(d, `IED[name="${ied}"] ${selector}`);
        expect(resolveRef(d, tag, ied, toRef(element)), `${tag} ${ied}`).to.equal(
          element
        );
      });
    });

    it('resolves a reference on another IED with the same structure', () => {
      const d = doc();
      const copy = one(d, 'IED[name="EDN1"]').cloneNode(true) as Element;
      copy.setAttribute('name', 'EDN2');
      d.documentElement.appendChild(copy);

      const ref = toRef(one(d, 'IED[name="EDN1"] ExtRef'));
      expect(resolveRef(d, 'ExtRef', 'EDN2', ref)).to.equal(
        one(d, 'IED[name="EDN2"] ExtRef')
      );
    });

    it('returns null for an unknown IED, a position out of range or nonsense', () => {
      const d = doc();
      expect(resolveRef(d, 'GSEControl', 'NOPE', '>>LD0>GC1')).to.be.null;
      expect(resolveRef(d, 'ExtRef', 'EDN1', '>>LD0>#7')).to.be.null;
      expect(resolveRef(d, 'ExtRef', 'NOPE', '>>LD0>#0')).to.be.null;
      expect(resolveRef(d, 'FCDA', 'PUB1', 'NONE')).to.be.null;
    });
  });
});
