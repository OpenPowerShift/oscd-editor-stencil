import { expect } from '@open-wc/testing';

import {
  SCHEMA_VERSION,
  parseStencil,
  serializeStencil,
  stencilFileName,
  validateStencil
} from './stencil-io.js';
import {
  makeApplication,
  makeStencil,
  makeVersion
} from '../testing/stencils.js';

const stencil = () =>
  makeStencil([makeApplication('Bus', 'BZ', [makeVersion('1.0.0')])]);

describe('stencil-io', () => {
  describe('parseStencil', () => {
    it('reports text that is not JSON instead of throwing', () => {
      const result = parseStencil('{ not json');
      expect(result.stencil).to.be.undefined;
      expect(result.errors![0]).to.match(/not valid JSON/);
    });

    it('reads a file written before schema versions and stamps the current one', () => {
      const result = parseStencil(JSON.stringify(stencil()));
      expect(result.errors).to.be.undefined;
      expect(result.stencil!.schemaVersion).to.equal(SCHEMA_VERSION);
      expect(result.stencil!.applications[0].versions[0].IEDS.Fn.manufacturer).to
        .equal('M');
    });

    it('reads a file of the current schema', () => {
      const text = JSON.stringify({ ...stencil(), schemaVersion: SCHEMA_VERSION });
      expect(parseStencil(text).stencil).to.exist;
    });

    it('rejects a newer schema with a message about updating', () => {
      const result = parseStencil(
        JSON.stringify({ ...stencil(), schemaVersion: SCHEMA_VERSION + 1 })
      );
      expect(result.stencil).to.be.undefined;
      expect(result.errors![0]).to.contain('only supports versions up to');
    });

    it('rejects a schema version that is not a whole number', () => {
      [0, 1.5, 'two', null].forEach((schemaVersion) => {
        const result = validateStencil({ ...stencil(), schemaVersion });
        expect(result.errors, `${schemaVersion}`).to.have.lengthOf(1);
      });
    });

    it('fills in what older files leave out', () => {
      const old = {
        name: 'Old',
        version: '1',
        applications: [
          {
            category: 'C',
            name: 'N',
            versions: [{ version: '1', IEDS: { A: { originalName: 'a', type: 't', manufacturer: 'm' } }, ControlBlocks: [] }]
          }
        ]
      };
      const read = parseStencil(JSON.stringify(old)).stencil!;
      const version = read.applications[0].versions[0];
      expect(read.applications[0].description).to.equal('');
      expect(version.description).to.equal('');
      expect(version.deprecated).to.be.false;
      expect(version.IEDS.A.privates).to.deep.equal([]);
    });

    it('names the path of each problem', () => {
      const result = validateStencil({
        name: 5,
        version: '1',
        applications: [
          { category: 'C', name: 'N', versions: [{ version: '1', IEDS: {}, ControlBlocks: [{ id: '>x', mappings: [{ FCDA: 1 }] }] }] }
        ]
      });
      expect(result.errors).to.include.members([
        'name must be text',
        'applications[0].versions[0].ControlBlocks[0].name must be text',
        'applications[0].versions[0].ControlBlocks[0].mappings[0].FCDA must be text'
      ]);
    });

    it('rejects values that are not a stencil', () => {
      ['null', '5', '[]', '"text"'].forEach((json) => {
        expect(parseStencil(json).errors, json).to.deep.equal([
          'The stencil must be an object'
        ]);
      });
      expect(validateStencil({ name: 'a', version: 'b' }).errors).to.deep.equal([
        'applications must be a list'
      ]);
    });

    it('stops listing problems after ten', () => {
      const applications = Array.from({ length: 30 }, () => 5);
      const result = validateStencil({ name: 'a', version: 'b', applications });
      expect(result.errors).to.have.lengthOf(10);
    });

    it('keeps control block details, including SEL supervision', () => {
      const withCb = stencil();
      withCb.applications[0].versions[0].ControlBlocks = [
        {
          id: '>>LD0>GC1',
          name: 'GC1',
          from: 'A',
          to: 'B',
          type: 'GSEControl',
          mappings: [{ FCDA: 'f', ExtRef: 'e' }],
          supervision: 'None',
          selSupervision: { name: 'Q', ExtRef: 'x' }
        }
      ];
      expect(parseStencil(JSON.stringify(withCb)).stencil!.applications).to.deep
        .equal(withCb.applications);
    });
  });

  describe('serializeStencil', () => {
    it('writes the current schema and reads back the same stencil', () => {
      const text = serializeStencil(stencil());
      expect(JSON.parse(text).schemaVersion).to.equal(SCHEMA_VERSION);
      expect(parseStencil(text).stencil).to.deep.equal({
        ...stencil(),
        schemaVersion: SCHEMA_VERSION
      });
    });
  });

  describe('stencilFileName', () => {
    it('replaces every space, not just the first', () => {
      expect(
        stencilFileName({ ...stencil(), name: 'Digital Substation Play', version: '1.0 beta' })
      ).to.equal('Digital_Substation_Play_1.0_beta.json');
    });

    it('replaces characters that are not allowed in file names', () => {
      expect(stencilFileName({ ...stencil(), name: 'A/B: C?' })).to.equal(
        'A_B_C__1.0.0.json'
      );
    });

    it('falls back when the name or version is empty', () => {
      expect(stencilFileName({ ...stencil(), name: '  ', version: '' })).to.equal(
        'Unknown_Stencil_Unknown_Version.json'
      );
    });
  });
});
