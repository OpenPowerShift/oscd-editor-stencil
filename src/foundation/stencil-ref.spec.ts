import { expect } from '@open-wc/testing';
import { identity } from '@openscd/scl-lib';

import {
  inputsRef,
  isLaterBindingRef,
  resolveRef,
  resolveSink,
  toRef
} from './stencil-ref.js';
import { fixtureXml } from '../testing/fixture-scd.js';

const doc = () => new DOMParser().parseFromString(fixtureXml, 'application/xml');
const one = (d: XMLDocument, selector: string) => d.querySelector(selector)!;

/** A copy of an IED under a new name. */
function copyIed(d: XMLDocument, from: string, name: string): Element {
  const copy = one(d, `IED[name="${from}"]`).cloneNode(true) as Element;
  copy.setAttribute('name', name);
  d.documentElement.appendChild(copy);
  return copy;
}

describe('stencil-ref', () => {
  describe('toRef', () => {
    it('is the scl-lib identity without the IED name', () => {
      const d = doc();
      const gc1 = one(d, 'IED[name="PUB1"] GSEControl[name="GC1"]');
      expect(toRef(gc1)).to.equal(`${identity(gc1)}`.substring('PUB1'.length));
      expect(toRef(gc1)).to.equal('>>LD0>GC1');
    });

    it('names an ExtRef with intAddr by its address, whatever it is subscribed to', () => {
      const d = doc();
      expect(toRef(one(d, 'IED[name="SUB1"] ExtRef[intAddr="I1"]'))).to.equal(
        '>>LD0>I1[0]'
      );
    });

    it('names an ExtRef without intAddr by the signal it refers to, within its Inputs', () => {
      const d = doc();
      expect(toRef(one(d, 'IED[name="EDN1"] ExtRef'))).to.equal(
        '>>LD0>PUB1 LD0/ GGIO 1 Ind3 stVal'
      );
    });
  });

  describe('later binding references', () => {
    it('are the ones that name an intAddr', () => {
      expect(isLaterBindingRef('>>LD0>I1[0]')).to.be.true;
      expect(isLaterBindingRef('>>LD0>PUB1 LD0/ GGIO 1 Ind3 stVal')).to.be.false;
    });
  });

  describe('inputsRef', () => {
    it('is the identity of the logical node holding the Inputs', () => {
      expect(inputsRef('>>LD0>PUB1 LD0/ GGIO 1 Ind3 stVal')).to.equal('>>LD0');
      expect(inputsRef('>>LD0>I1[0]')).to.equal('>>LD0');
    });

    it('does not depend on the signal, which is not a location', () => {
      expect(inputsRef('>>LD0>OTHER LD9/ XXXX 1 Foo bar')).to.equal('>>LD0');
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
        ['LN', 'SUB1', 'LN[lnClass="LSVS"]']
      ];
      cases.forEach(([tag, ied, selector]) => {
        const element = one(d, `IED[name="${ied}"] ${selector}`);
        expect(resolveRef(d, tag, ied, toRef(element)), `${tag} ${ied}`).to.equal(
          element
        );
      });
    });

    it('returns null for an unknown IED or reference', () => {
      const d = doc();
      expect(resolveRef(d, 'GSEControl', 'NOPE', '>>LD0>GC1')).to.be.null;
      expect(resolveRef(d, 'FCDA', 'PUB1', 'NONE')).to.be.null;
    });
  });

  describe('resolveSink', () => {
    it('is the existing ExtRef for a later binding reference', () => {
      const d = doc();
      expect(resolveSink(d, 'SUB1', '>>LD0>I2[0]')).to.equal(
        one(d, 'IED[name="SUB1"] ExtRef[intAddr="I2"]')
      );
    });

    it('is the Inputs where an ExtRef without intAddr is created, on any IED with that logical node', () => {
      const d = doc();
      const copy = copyIed(d, 'EDN1', 'EDN2');
      const ref = toRef(one(d, 'IED[name="EDN1"] ExtRef'));

      expect(resolveSink(d, 'EDN1', ref)).to.equal(one(d, 'IED[name="EDN1"] Inputs'));
      expect(resolveSink(d, 'EDN2', ref)).to.equal(copy.querySelector('Inputs'));
    });

    it('does not need an ExtRef, or the signal, to be there', () => {
      const d = doc();
      const copy = copyIed(d, 'EDN1', 'EDN2');
      copy.querySelector('ExtRef')!.remove();
      expect(
        resolveSink(d, 'EDN2', '>>LD0>PUB1 LD0/ GGIO 1 Ind3 stVal')
      ).to.equal(copy.querySelector('Inputs'));
    });

    it('falls back to the logical node when it has no Inputs yet', () => {
      const d = doc();
      const copy = copyIed(d, 'EDN1', 'EDN2');
      copy.querySelector('Inputs')!.remove();
      expect(resolveSink(d, 'EDN2', '>>LD0>PUB1 LD0/ GGIO 1 Ind3 stVal')).to.equal(
        copy.querySelector('LN0')
      );
    });

    it('is null for an IED or logical node that does not exist', () => {
      const d = doc();
      expect(resolveSink(d, 'NOPE', '>>LD0>x')).to.be.null;
      expect(resolveSink(d, 'EDN1', '>>LD9>x')).to.be.null;
      expect(resolveSink(d, 'SUB1', '>>LD0>I9[0]')).to.be.null;
    });
  });
});
