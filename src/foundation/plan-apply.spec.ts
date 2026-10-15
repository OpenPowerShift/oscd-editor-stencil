import { expect } from '@open-wc/testing';
import { handleEdit } from '@omicronenergy/oscd-editor';

import { getMappingInfo } from './mapping-info.js';
import { planApply } from './plan-apply.js';
import type { Application } from './types.js';
import { applicationFrom, cloneAsClean } from '../testing/scl.js';
import { fixtureXml } from '../testing/fixture-scd.js';

const attrs = (extRef: Element | null) => ({
  iedName: extRef?.getAttribute('iedName'),
  srcCBName: extRef?.getAttribute('srcCBName'),
  serviceType: extRef?.getAttribute('serviceType'),
  doName: extRef?.getAttribute('doName')
});

describe('planApply', () => {
  let doc: XMLDocument;

  beforeEach(() => {
    doc = new DOMParser().parseFromString(fixtureXml, 'application/xml');
  });

  describe('applying a captured application to clean IEDs', () => {
    let application: Application;

    beforeEach(() => {
      cloneAsClean(doc, 'PUB1', 'PUB2');
      cloneAsClean(doc, 'SUB1', 'SUB2');
      application = applicationFrom(
        getMappingInfo(doc, 'PUB1', 'SUB1'),
        'PUBF',
        'SUBF'
      );
    });

    it('recreates the subscriptions and supervisions of the original IED pair', () => {
      const plan = planApply(
        doc,
        application,
        new Map([
          ['PUBF', 'PUB2'],
          ['SUBF', 'SUB2']
        ])
      );

      expect(plan.errors).to.be.empty;
      plan.edits.forEach(edit => handleEdit(edit));

      const sub2 = (intAddr: string) =>
        doc.querySelector(`IED[name="SUB2"] ExtRef[intAddr="${intAddr}"]`);
      expect(attrs(sub2('I1'))).to.deep.equal({
        iedName: 'PUB2',
        srcCBName: 'GC1',
        serviceType: 'GOOSE',
        doName: 'Ind1'
      });
      expect(attrs(sub2('I2')).doName).to.equal('Ind2');
      expect(attrs(sub2('I3'))).to.include({
        iedName: 'PUB2',
        srcCBName: 'SV1',
        serviceType: 'SMV'
      });

      const val = (lnClass: string) =>
        doc.querySelector(`IED[name="SUB2"] LN[lnClass="${lnClass}"] Val`)
          ?.textContent;
      expect(val('LGOS')).to.equal('PUB2LD0/LLN0.GC1');
      expect(val('LSVS')).to.equal('PUB2LD0/LLN0.SV1');
    });

    it('does not change the document itself', () => {
      const before = new XMLSerializer().serializeToString(doc);
      planApply(
        doc,
        application,
        new Map([
          ['PUBF', 'PUB2'],
          ['SUBF', 'SUB2']
        ])
      );
      expect(new XMLSerializer().serializeToString(doc)).to.equal(before);
    });

    it('counts what it will do and describes each control block', () => {
      const plan = planApply(
        doc,
        application,
        new Map([
          ['PUBF', 'PUB2'],
          ['SUBF', 'SUB2']
        ])
      );
      expect(plan).to.include({
        subscriptions: 3,
        supervisions: 2,
        qualityLinks: 0,
        present: 0
      });
      expect(plan.items).to.deep.equal([
        {
          id: '>>LD0>GC1',
          failed: false,
          controlBlock: 'GC1',
          type: 'GSEControl',
          from: 'PUB2',
          to: 'SUB2',
          subscriptions: 2,
          present: 0,
          supervision: 'new',
          quality: 'none'
        },
        {
          id: '>>LD0>SV1',
          failed: false,
          controlBlock: 'SV1',
          type: 'SampledValueControl',
          from: 'PUB2',
          to: 'SUB2',
          subscriptions: 1,
          present: 0,
          supervision: 'new',
          quality: 'none'
        }
      ]);
    });

    it('changes nothing when applied a second time', () => {
      const functions = new Map([
        ['PUBF', 'PUB2'],
        ['SUBF', 'SUB2']
      ]);
      planApply(doc, application, functions).edits.forEach(edit =>
        handleEdit(edit)
      );

      const again = planApply(doc, application, functions);
      expect(again.edits).to.be.empty;
      expect(again.errors).to.be.empty;
      expect(again).to.include({
        subscriptions: 0,
        supervisions: 0,
        present: 3 + 2
      });
      expect(again.items.map(i => i.supervision)).to.deep.equal([
        'present',
        'present'
      ]);
    });

    it('only plans what is missing when some of it is already there', () => {
      const functions = new Map([
        ['PUBF', 'PUB2'],
        ['SUBF', 'SUB2']
      ]);
      const first = planApply(doc, application, functions);
      // apply only the first subscription
      const subscription = first.edits.find((edit) => {
        const target = (edit as { element?: Element; node?: Node }).element
          ?? (edit as { node?: Node }).node;
        return (target as Element | undefined)?.tagName === 'ExtRef';
      })!;
      handleEdit(subscription);

      const next = planApply(doc, application, functions);
      expect(next.present).to.equal(1);
      expect(next.subscriptions).to.equal(2);
    });

    it('does not replace an input that is already subscribed to another source', () => {
      const functions = new Map([
        ['PUBF', 'PUB2'],
        ['SUBF', 'SUB2']
      ]);
      const taken = doc.querySelector('IED[name="SUB2"] ExtRef[intAddr="I1"]')!;
      [
        ['iedName', 'OTHER'],
        ['ldInst', 'LD0'],
        ['lnClass', 'GGIO'],
        ['lnInst', '1'],
        ['doName', 'Ind9']
      ].forEach(([name, value]) => taken.setAttribute(name, value));

      const plan = planApply(doc, application, functions);
      expect(plan.errors).to.be.empty;
      expect(plan.conflicts).to.deep.equal([
        {
          ied: 'SUB2',
          input: application.ControlBlocks[0].mappings[0].ExtRef,
          current: 'OTHER',
          proposed: 'PUB2',
          controlBlock: 'GC1'
        }
      ]);
      expect(plan.items[0].failed).to.be.false;
      plan.edits.forEach(edit => handleEdit(edit));
      expect(taken.getAttribute('iedName')).to.equal('OTHER');
      expect(taken.getAttribute('doName')).to.equal('Ind9');
    });

    it('replaces an input subscribed to another source when asked, as the original plugin did', () => {
      const functions = new Map([
        ['PUBF', 'PUB2'],
        ['SUBF', 'SUB2']
      ]);
      const taken = doc.querySelector('IED[name="SUB2"] ExtRef[intAddr="I1"]')!;
      [
        ['iedName', 'OTHER'],
        ['ldInst', 'LD0'],
        ['lnClass', 'GGIO'],
        ['lnInst', '1'],
        ['doName', 'Ind9']
      ].forEach(([name, value]) => taken.setAttribute(name, value));

      const kept = planApply(doc, application, functions);
      const replaced = planApply(doc, application, functions, { replaceSubscribed: true });
      expect(replaced.conflicts).to.have.lengthOf(1);
      expect(replaced.subscriptions).to.equal(kept.subscriptions + 1);
      replaced.edits.forEach(edit => handleEdit(edit));
      expect(taken.getAttribute('iedName')).to.equal('PUB2');
      expect(taken.getAttribute('doName')).to.equal('Ind1');

      const again = planApply(doc, application, functions);
      expect(again.conflicts).to.be.empty;
      expect(again.edits).to.be.empty;
    });

    it('fills an input whatever its type restrictions, as the original plugin did', () => {
      const functions = new Map([
        ['PUBF', 'PUB2'],
        ['SUBF', 'SUB2']
      ]);
      const restricted = doc.querySelector('IED[name="SUB2"] ExtRef[intAddr="I1"]')!;
      restricted.setAttribute('pDO', 'Ind1');
      restricted.setAttribute('pServT', 'SMV');

      const plan = planApply(doc, application, functions);
      expect(plan.errors).to.be.empty;
      plan.edits.forEach(edit => handleEdit(edit));
      expect(restricted.getAttribute('iedName')).to.equal('PUB2');
    });

    it('marks a control block that cannot be found as failed', () => {
      doc.querySelector('IED[name="PUB2"] GSEControl[name="GC1"]')!.remove();
      const plan = planApply(
        doc,
        application,
        new Map([
          ['PUBF', 'PUB2'],
          ['SUBF', 'SUB2']
        ])
      );
      const gc1 = plan.items.find(item => item.id === '>>LD0>GC1')!;
      expect(gc1.failed).to.be.true;
      expect(plan.errors.join()).to.contain('Could not find CB');
    });

    it('plans nothing until both functions have an IED', () => {
      const plan = planApply(doc, application, new Map([['PUBF', 'PUB2']]));
      expect(plan.edits).to.be.empty;
      expect(plan.errors).to.be.empty;
    });

    it('applies in either order of the assigned functions', () => {
      const plan = planApply(
        doc,
        application,
        new Map([
          ['SUBF', 'SUB2'],
          ['PUBF', 'PUB2']
        ])
      );
      expect(plan.errors).to.be.empty;
      expect(plan.subscriptions).to.equal(3);
    });
  });

  describe('SEL message quality', () => {
    it('points the quality ExtRef at the control block of the new publisher', () => {
      cloneAsClean(doc, 'PUB1', 'PUB2');
      cloneAsClean(doc, 'SELR', 'SELR2');
      const application = applicationFrom(
        getMappingInfo(doc, 'PUB1', 'SELR'),
        'PUBF',
        'SELF'
      );

      const plan = planApply(
        doc,
        application,
        new Map([
          ['PUBF', 'PUB2'],
          ['SELF', 'SELR2']
        ])
      );
      expect(plan.errors).to.be.empty;
      plan.edits.forEach(edit => handleEdit(edit));

      const quality = doc.querySelector(
        'IED[name="SELR2"] ExtRef[intAddr="Q_GC1"]'
      )!;
      expect(quality.getAttribute('iedName')).to.equal('PUB2');
      expect(quality.getAttribute('srcCBName')).to.equal('GC1');
      expect(quality.getAttribute('srcLDInst')).to.equal('LD0');
      expect(quality.getAttribute('srcLNClass')).to.equal('LLN0');
      expect(quality.hasAttribute('srcPrefix')).to.be.false;
      expect(quality.hasAttribute('srcLNInst')).to.be.false;
      expect(quality.hasAttribute('serviceType')).to.be.false;
      expect(
        doc
          .querySelector('IED[name="SELR2"] ExtRef[intAddr="S1"]')
          ?.getAttribute('serviceType')
      ).to.equal('GOOSE');
    });
  });

  describe('reporting problems', () => {
    let application: Application;
    const functions = new Map([
      ['PUBF', 'PUB1'],
      ['SUBF', 'SUB1']
    ]);

    beforeEach(() => {
      application = applicationFrom(
        getMappingInfo(doc, 'PUB1', 'SUB1'),
        'PUBF',
        'SUBF'
      );
    });

    it('names a control block that does not exist', () => {
      const plan = planApply(
        doc,
        application,
        new Map([
          ['PUBF', 'PUB9'],
          ['SUBF', 'SUB1']
        ])
      );
      expect(plan.errors).to.include('Could not find CB: PUB9>>LD0>GC1');
      expect(plan.edits).to.be.empty;
    });

    it('names an FCDA or ExtRef that does not exist and keeps the rest', () => {
      application.ControlBlocks[0].mappings[0].FCDA = '>>LD0>DS_G>nothing';
      application.ControlBlocks[0].mappings[1].ExtRef = '>>LD0>nothing[0]';
      const plan = planApply(doc, application, functions);

      expect(plan.errors).to.include.members([
        'Could not find FCDA: PUB1>>LD0>DS_G>nothing',
        'Could not find ExtRef: SUB1>>LD0>nothing[0]'
      ]);
      // both GC1 mappings are skipped; the SV1 mapping remains and, as this
      // is the original subscriber, it already exists
      expect(plan.subscriptions).to.equal(0);
      expect(plan.present).to.equal(1 + 2);
    });

    it('names a missing supervision and one that cannot be instantiated', () => {
      application.ControlBlocks[0].supervision = '>>LD0> LGOS 9';
      const plan = planApply(doc, application, functions);
      expect(plan.errors).to.include('Could not find Supervision: SUB1>>LD0> LGOS 9');
    });

    it('reports two control blocks sharing one supervision LN', () => {
      cloneAsClean(doc, 'PUB1', 'PUB2');
      cloneAsClean(doc, 'SUB1', 'SUB2');
      const [gooseCb] = application.ControlBlocks;
      application.ControlBlocks.push({
        ...gooseCb,
        id: '>>LD0>GC2',
        name: 'GC2',
        mappings: []
      });
      const plan = planApply(
        doc,
        application,
        new Map([
          ['PUBF', 'PUB2'],
          ['SUBF', 'SUB2']
        ])
      );
      expect(plan.errors).to.deep.equal([
        'Supervision used by more than one control block: SUB2>>LD0> LGOS 1'
      ]);
    });

    it('leaves a supervision that already references the control block alone', () => {
      const plan = planApply(doc, application, functions);
      expect(plan.errors).to.be.empty;
      expect(plan.items.map(i => i.supervision)).to.deep.equal([
        'present',
        'present'
      ]);
    });

    it('names the quality ExtRef id when it is missing', () => {
      cloneAsClean(doc, 'SELR', 'SELR2');
      const sel = applicationFrom(
        getMappingInfo(doc, 'PUB1', 'SELR'),
        'PUBF',
        'SELF'
      );
      sel.ControlBlocks[0].selSupervision!.ExtRef = '>>LD0>nothing[0]';
      const plan = planApply(
        doc,
        sel,
        new Map([
          ['PUBF', 'PUB1'],
          ['SELF', 'SELR2']
        ])
      );
      expect(plan.errors).to.include(
        'Could not find ExtRef for quality mapping: SELR2>>LD0>nothing[0]'
      );
    });

    it('does not need supervision when the stencil has none', () => {
      application.ControlBlocks.forEach((cb) => {
        cb.supervision = 'None';
      });
      const plan = planApply(doc, application, functions);
      expect(plan.errors).to.be.empty;
      expect(plan.supervisions).to.equal(0);
      expect(plan.items.every(item => item.supervision === 'none')).to.be.true;
    });
  });

  describe('ExtRefs without intAddr (not later binding)', () => {
    // IEC 61850-6 has the system tool create such ExtRefs itself, so a clean
    // IED does not have one to fill: it is created in the Inputs.
    let application: Application;
    const functions = new Map([
      ['PUBF', 'PUB2'],
      ['EDNF', 'EDN2']
    ]);

    const addEdition1ExtRef = (): void => {
      doc.querySelector('IED[name="EDN1"] Inputs')!.appendChild(
        doc.importNode(
          new DOMParser().parseFromString(
            `<ExtRef xmlns="${doc.documentElement.namespaceURI}" iedName="PUB1" ldInst="LD0" lnClass="GGIO" lnInst="1" doName="Ind1" daName="stVal"/>`,
            'application/xml'
          ).documentElement,
          true
        )
      );
    };

    /** A clean copy of EDN1 with the given part of its Inputs removed. */
    const cleanEdn = (keep: 'nothing' | 'unrelated' | 'no-inputs'): Element => {
      const copy = doc.querySelector('IED[name="EDN1"]')!.cloneNode(true) as Element;
      copy.setAttribute('name', 'EDN2');
      doc.documentElement.appendChild(copy);
      const inputs = copy.querySelector('Inputs')!;
      inputs.querySelectorAll('ExtRef').forEach(e => e.remove());
      if (keep === 'unrelated') {
        const other = doc.createElementNS(doc.documentElement.namespaceURI, 'ExtRef');
        other.setAttribute('iedName', 'OTHER');
        other.setAttribute('ldInst', 'LD7');
        other.setAttribute('lnClass', 'GGIO');
        other.setAttribute('lnInst', '1');
        other.setAttribute('doName', 'Alm1');
        inputs.appendChild(other);
      }
      if (keep === 'no-inputs') {
        inputs.remove();
      }
      return copy;
    };

    beforeEach(() => {
      addEdition1ExtRef();
      cloneAsClean(doc, 'PUB1', 'PUB2');
      application = applicationFrom(getMappingInfo(doc, 'PUB1', 'EDN1'), 'PUBF', 'EDNF');
    });

    const extRefsOf = (ied: string) =>
      Array.from(doc.querySelectorAll(`IED[name="${ied}"] ExtRef`));

    it('creates the ExtRefs in the Inputs of an IED that has none', () => {
      cleanEdn('nothing');
      const plan = planApply(doc, application, functions);
      expect(plan.errors).to.be.empty;
      expect(plan).to.include({ subscriptions: 2, present: 0 });
      plan.edits.forEach(edit => handleEdit(edit));

      expect(
        extRefsOf('EDN2').map(e => `${e.getAttribute('iedName')} ${e.getAttribute('doName')} ${e.getAttribute('srcCBName')} ${e.getAttribute('serviceType')}`).sort()
      ).to.deep.equal(['PUB2 Ind1 GC1 GOOSE', 'PUB2 Ind3 GC2 GOOSE']);
      expect(extRefsOf('EDN2').every(e => !e.hasAttribute('intAddr'))).to.be.true;
    });

    it('creates the Inputs too when the logical node has none', () => {
      const copy = cleanEdn('no-inputs');
      const plan = planApply(doc, application, functions);
      expect(plan.errors).to.be.empty;
      plan.edits.forEach(edit => handleEdit(edit));

      expect(copy.querySelectorAll('LN0 > Inputs > ExtRef')).to.have.lengthOf(2);
      // two control blocks use the same logical node: its Inputs is created once
      expect(copy.querySelectorAll('LN0 > Inputs')).to.have.lengthOf(1);
    });

    it('leaves the ExtRefs that are already there alone', () => {
      cleanEdn('unrelated');
      planApply(doc, application, functions).edits.forEach(edit => handleEdit(edit));

      const other = extRefsOf('EDN2').find(e => e.getAttribute('iedName') === 'OTHER')!;
      expect(other.getAttribute('doName')).to.equal('Alm1');
      expect(extRefsOf('EDN2')).to.have.lengthOf(3);
    });

    it('creates nothing the second time', () => {
      cleanEdn('nothing');
      planApply(doc, application, functions).edits.forEach(edit => handleEdit(edit));

      const again = planApply(doc, application, functions);
      expect(again.edits).to.be.empty;
      expect(again).to.include({ subscriptions: 0, present: 2 });
      expect(extRefsOf('EDN2')).to.have.lengthOf(2);
    });

    it('does not take an ExtRef for the same signal from another control block as its own', () => {
      cleanEdn('nothing');
      planApply(doc, application, functions).edits.forEach(edit => handleEdit(edit));
      // the same data, but taken from GC2 instead of GC1
      extRefsOf('EDN2').find(e => e.getAttribute('doName') === 'Ind1')!.setAttribute('srcCBName', 'GC2');
      expect(planApply(doc, application, functions).subscriptions).to.equal(1);
    });

    it('does not create ExtRefs on an IED that only accepts later binding', () => {
      const copy = cleanEdn('nothing');
      copy.insertBefore(
        new DOMParser().parseFromString(
          `<Services xmlns="${doc.documentElement.namespaceURI}"><ClientServices noIctBinding="true"/></Services>`,
          'application/xml'
        ).documentElement,
        copy.firstChild
      );

      const plan = planApply(doc, application, functions);
      expect(plan.edits).to.be.empty;
      expect(plan.errors).to.deep.equal([
        'Cannot create ExtRef on EDN2: it only accepts later binding (ClientServices noIctBinding)'
      ]);
    });

    it('creates ExtRefs when the IED allows the system tool to bind inputs', () => {
      const copy = cleanEdn('nothing');
      copy.insertBefore(
        new DOMParser().parseFromString(
          `<Services xmlns="${doc.documentElement.namespaceURI}"><ClientServices noIctBinding="false"/></Services>`,
          'application/xml'
        ).documentElement,
        copy.firstChild
      );
      expect(planApply(doc, application, functions).subscriptions).to.equal(2);
    });

    it('names a logical node that does not exist', () => {
      cleanEdn('nothing');
      application.ControlBlocks[0].mappings[0].ExtRef = '>>LD9>PUB1 LD0/ GGIO 1 Ind1 stVal';
      expect(planApply(doc, application, functions).errors).to.include(
        'Could not find logical node for input: EDN2>>LD9'
      );
    });
  });
});
