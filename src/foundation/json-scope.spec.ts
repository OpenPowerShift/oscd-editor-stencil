import { expect } from '@open-wc/testing';

import { applyScopeText, scopeText } from './json-scope.js';
import { serializeStencil } from './stencil-io.js';
import { makeApplication, makeStencil, makeVersion } from '../testing/stencils.js';

const stencil = makeStencil([
  makeApplication('Bus', 'BZ', [makeVersion('1.0.0'), makeVersion('2.0.0')]),
  makeApplication('Bus', 'Other', [makeVersion('1.0.0')])
]);
const key = { category: 'Bus', name: 'BZ' };

describe('json-scope', () => {
  describe('the text of a scope', () => {
    it('is the whole stencil, an application, or a version', () => {
      expect(scopeText(stencil, { kind: 'stencil' })).to.equal(serializeStencil(stencil));
      expect(JSON.parse(scopeText(stencil, { kind: 'application', key })).name).to.equal('BZ');
      expect(
        JSON.parse(scopeText(stencil, { kind: 'version', key, version: '2.0.0' })).version
      ).to.equal('2.0.0');
    });

    it('falls back to the whole stencil when the scope is gone', () => {
      const gone = { category: 'No', name: 'Such' };
      expect(scopeText(stencil, { kind: 'application', key: gone })).to.equal(serializeStencil(stencil));
      expect(scopeText(stencil, { kind: 'version', key, version: '9' })).to.equal(serializeStencil(stencil));
    });
  });

  describe('applying edited text', () => {
    it('reports text that is not JSON', () => {
      const result = applyScopeText(stencil, { kind: 'stencil' }, '{ nope');
      expect(result.errors![0]).to.contain('not valid JSON');
      expect(applyScopeText(stencil, { kind: 'version', key, version: '1.0.0' }, '[').errors).to.have.lengthOf(1);
    });

    it('checks a whole stencil like a file', () => {
      expect(applyScopeText(stencil, { kind: 'stencil' }, '{"name": 5}').errors!.length).to.be.greaterThan(0);
      const next = { ...stencil, name: 'Renamed' };
      expect(
        applyScopeText(stencil, { kind: 'stencil' }, JSON.stringify(next)).stencil!.name
      ).to.equal('Renamed');
    });

    it('replaces an application where it was, leaving the rest', () => {
      const edited = { ...stencil.applications[0], description: 'new words' };
      const result = applyScopeText(stencil, { kind: 'application', key }, JSON.stringify(edited));
      expect(result.stencil!.applications[0].description).to.equal('new words');
      expect(result.stencil!.applications[1]).to.equal(stencil.applications[1]);
      expect(stencil.applications[0].description).to.not.equal('new words');
    });

    it('refuses an application that takes the name of another, or is not one', () => {
      const clash = { ...stencil.applications[0], name: 'Other' };
      expect(
        applyScopeText(stencil, { kind: 'application', key }, JSON.stringify(clash)).errors![0]
      ).to.contain('exists');
      expect(applyScopeText(stencil, { kind: 'application', key }, '{"x": 1}').errors!.length).to.be.greaterThan(0);
    });

    it('replaces a version, checking it like a file with paths relative to the version', () => {
      const edited = { ...stencil.applications[0].versions[0], description: 'v words' };
      const result = applyScopeText(stencil, { kind: 'version', key, version: '1.0.0' }, JSON.stringify(edited));
      expect(result.stencil!.applications[0].versions[0].description).to.equal('v words');
      expect(result.stencil!.applications[0].versions[1]).to.equal(stencil.applications[0].versions[1]);

      const broken = applyScopeText(stencil, { kind: 'version', key, version: '1.0.0' }, '{"version": 5}');
      expect(broken.errors!.join()).to.not.contain('applications[0]');
      expect(broken.errors!.length).to.be.greaterThan(0);
    });

    it('refuses a version number another version has', () => {
      const clash = { ...stencil.applications[0].versions[0], version: '2.0.0' };
      expect(
        applyScopeText(stencil, { kind: 'version', key, version: '1.0.0' }, JSON.stringify(clash)).errors![0]
      ).to.contain('exists');
    });

    it('says when the application has gone', () => {
      const gone = { category: 'No', name: 'Such' };
      expect(
        applyScopeText(stencil, { kind: 'application', key: gone }, '{}').errors![0]
      ).to.contain('no longer');
    });
  });
});
