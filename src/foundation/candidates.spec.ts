import { expect } from '@open-wc/testing';
import { handleEdit } from '@omicronenergy/oscd-editor';

import {
  autoAssign,
  candidateIeds,
  describeRequirement,
  functionNames,
  noCandidateReason,
  requiredTags
} from './candidates.js';
import { tagIedEdits } from './ied-tags.js';
import type { Application, IedRequirement } from './types.js';
import { cloneAsClean } from '../testing/scl.js';
import { fixtureXml } from '../testing/fixture-scd.js';

const requirement = (
  manufacturer: string,
  type: string,
  ...tags: [string, string][]
): IedRequirement => ({
  originalName: 'X',
  manufacturer,
  type,
  privates: tags.map(([id, version]) => ({
    'OpenSCD-Stencil-Id': id,
    'OpenSCD-Stencil-Version': version
  }))
});

const names = (ieds: Element[]) => ieds.map(ied => ied.getAttribute('name'));

describe('candidates', () => {
  let doc: XMLDocument;

  const tag = (ied: string, id: string, version = '1.0.0') =>
    tagIedEdits(doc.querySelector(`IED[name="${ied}"]`)!, id, version).forEach(
      edit => handleEdit(edit)
    );

  beforeEach(() => {
    doc = new DOMParser().parseFromString(fixtureXml, 'application/xml');
    cloneAsClean(doc, 'PUB1', 'PUB2');
  });

  describe('requirements', () => {
    it('ignores the placeholder written when the captured IED had no tag', () => {
      const untagged = requirement(
        'SIEMENS',
        '7SS85',
        ['No Stencil Id Found', 'No Stencil Version Found']
      );
      expect(requiredTags(untagged)).to.be.empty;
      expect(describeRequirement(untagged)).to.equal('SIEMENS 7SS85');
    });

    it('describes the tags that are needed', () => {
      expect(
        describeRequirement(
          requirement('SIEMENS', '7SS85', ['BZ', '1.0.0'], ['BZ', '2.0.0'])
        )
      ).to.equal('SIEMENS 7SS85, tagged BZ 1.0.0 or BZ 2.0.0');
    });
  });

  describe('candidateIeds', () => {
    it('matches manufacturer and type when no tag is needed', () => {
      expect(
        names(candidateIeds(doc, requirement('SIEMENS', '7SS85')))
      ).to.deep.equal(['PUB1', 'PUB2']);
      expect(candidateIeds(doc, requirement('SIEMENS', 'other'))).to.be.empty;
      expect(candidateIeds(doc, requirement('OTHER', '7SS85'))).to.be.empty;
    });

    it('requires one of the tags when there are any', () => {
      tag('PUB1', 'BZ');
      tag('PUB2', 'BZ', '2.0.0');
      expect(
        names(candidateIeds(doc, requirement('SIEMENS', '7SS85', ['BZ', '1.0.0'])))
      ).to.deep.equal(['PUB1']);
      expect(
        names(
          candidateIeds(
            doc,
            requirement('SIEMENS', '7SS85', ['BZ', '1.0.0'], ['BZ', '2.0.0'])
          )
        )
      ).to.deep.equal(['PUB1', 'PUB2']);
    });

    it('leaves out IEDs that other functions use', () => {
      expect(
        names(candidateIeds(doc, requirement('SIEMENS', '7SS85'), new Set(['PUB1'])))
      ).to.deep.equal(['PUB2']);
    });
  });

  describe('noCandidateReason', () => {
    it('is null when there is a candidate', () => {
      expect(noCandidateReason(doc, requirement('SIEMENS', '7SS85'))).to.be.null;
    });

    it('says when the file has no IED of that kind', () => {
      expect(noCandidateReason(doc, requirement('ABB', 'REL670'))).to.equal(
        'No ABB REL670 IED in this file'
      );
    });

    it('says when IEDs of the kind exist but none is tagged', () => {
      expect(
        noCandidateReason(doc, requirement('SIEMENS', '7SS85', ['BZ', '1.0.0']))
      ).to.equal('2 SIEMENS 7SS85 IEDs found, but none is tagged BZ 1.0.0');
      expect(
        noCandidateReason(doc, requirement('SEL', 'SEL-421', ['X', '1']))
      ).to.equal('1 SEL SEL-421 IED found, but none is tagged X 1');
    });

    it('says when all matching IEDs are used', () => {
      expect(
        noCandidateReason(
          doc,
          requirement('SIEMENS', '7SS85'),
          new Set(['PUB1', 'PUB2'])
        )
      ).to.equal('Every matching IED is used by another function');
    });
  });

  describe('autoAssign', () => {
    const version = (
      functions: Record<string, IedRequirement>
    ): Application => ({
      version: '1',
      description: '',
      deprecated: false,
      IEDS: functions,
      ControlBlocks: []
    });

    it('lists functions alphabetically regardless of case', () => {
      expect(
        functionNames(
          version({ b: requirement('M', 'T'), A: requirement('M', 'T'), c: requirement('M', 'T') })
        )
      ).to.deep.equal(['A', 'b', 'c']);
    });

    it('assigns functions that have exactly one candidate', () => {
      const result = autoAssign(
        doc,
        version({
          Sub: requirement('SIEMENS', '6MU85'),
          Sel: requirement('SEL', 'SEL-421')
        })
      );
      expect([...result]).to.deep.equal([
        ['Sel', 'SELR'],
        ['Sub', 'SUB1']
      ]);
    });

    it('leaves a function alone when it has several candidates', () => {
      expect(autoAssign(doc, version({ Pub: requirement('SIEMENS', '7SS85') })).size).to.equal(0);
    });

    it('uses what is left after other functions are assigned', () => {
      const result = autoAssign(
        doc,
        version({ A: requirement('SIEMENS', '7SS85'), B: requirement('SIEMENS', '7SS85') }),
        new Map([['A', 'PUB1']])
      );
      expect(result.get('B')).to.equal('PUB2');
    });

    it('keeps choices already made and does not change its input', () => {
      const current = new Map([['Pub', 'PUB2']]);
      const result = autoAssign(
        doc,
        version({ Pub: requirement('SIEMENS', '7SS85') }),
        current
      );
      expect(result.get('Pub')).to.equal('PUB2');
      expect(result).to.not.equal(current);
    });

    it('does not give one IED to two functions', () => {
      const result = autoAssign(
        doc,
        version({ A: requirement('SEL', 'SEL-421'), B: requirement('SEL', 'SEL-421') })
      );
      expect([...result.values()]).to.deep.equal(['SELR']);
    });
  });
});
