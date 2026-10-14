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

    it('counts subscriptions and supervisions', () => {
      const plan = planApply(
        doc,
        application,
        new Map([
          ['PUBF', 'PUB2'],
          ['SUBF', 'SUB2']
        ])
      );
      // 2 + 1 subscriptions; per control block one count plus one per LGOS/LSVS
      expect(plan.subscriptions).to.equal(3);
      expect(plan.supervisions).to.equal(4);
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
      // both GC1 mappings are skipped, the SV1 mapping remains
      expect(plan.subscriptions).to.equal(1);
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

    it('cannot instantiate a supervision that already references the control block', () => {
      const plan = planApply(doc, application, functions);
      expect(plan.errors).to.include(
        'Could not instantiate supervision: SUB1>>LD0> LGOS 1'
      );
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
      expect(plan.supervisions).to.equal(2);
    });
  });
});
