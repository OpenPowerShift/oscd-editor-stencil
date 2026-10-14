import { expect } from '@open-wc/testing';

import {
  applicationProblem,
  compareVersions,
  functionProblem,
  removeApplication,
  renameFunction,
  replaceVersion,
  updateApplication,
  updateRequirement,
  updateVersion,
  versionProblem,
  defaultVersion,
  hasApplicationVersion,
  removeApplicationVersion,
  renameStencil,
  selectableVersions,
  summarizeVersion,
  upsertApplicationVersion,
  visibleApplications
} from './stencil-model.js';
import {
  makeApplication,
  makeStencil,
  makeVersion
} from '../testing/stencils.js';

const key = { category: 'Bus', name: 'BZ' };
const info = { ...key, description: 'new description' };

describe('stencil-model', () => {
  describe('versions', () => {
    it('orders numerically, so 1.10.0 is newer than 1.9.0', () => {
      expect(compareVersions('1.10.0', '1.9.0')).to.be.greaterThan(0);
      expect(compareVersions('1.0.0', '1.0.0')).to.equal(0);
      expect(compareVersions('0.9', '1.0')).to.be.lessThan(0);
    });

    it('selects versions newest first, hiding deprecated ones unless shown', () => {
      const app = makeApplication('Bus', 'BZ', [
        makeVersion('1.0.0'),
        makeVersion('1.10.0', true),
        makeVersion('1.9.0')
      ]);
      expect(selectableVersions(app, false).map(v => v.version)).to.deep.equal([
        '1.9.0',
        '1.0.0'
      ]);
      expect(selectableVersions(app, true).map(v => v.version)).to.deep.equal([
        '1.10.0',
        '1.9.0',
        '1.0.0'
      ]);
    });

    it('does not reorder the stored versions', () => {
      const app = makeApplication('Bus', 'BZ', [
        makeVersion('1.0.0'),
        makeVersion('2.0.0')
      ]);
      selectableVersions(app, true);
      expect(app.versions.map(v => v.version)).to.deep.equal(['1.0.0', '2.0.0']);
    });

    it('prefers the newest current version, and a deprecated one only when shown', () => {
      const mixed = makeApplication('Bus', 'BZ', [
        makeVersion('2.0.0', true),
        makeVersion('1.0.0')
      ]);
      expect(defaultVersion(mixed, true)?.version).to.equal('1.0.0');

      const old = makeApplication('Bus', 'Old', [makeVersion('1.0.0', true)]);
      expect(defaultVersion(old, false)).to.be.undefined;
      expect(defaultVersion(old, true)?.version).to.equal('1.0.0');
    });
  });

  describe('visibleApplications (showing deprecated)', () => {
    const stencil = makeStencil([
      makeApplication('Bus', 'Current', [makeVersion('1.0.0')]),
      makeApplication('Bus', 'Mixed', [
        makeVersion('1.0.0'),
        makeVersion('2.0.0', true)
      ]),
      makeApplication('Bus', 'Old', [makeVersion('1.0.0', true)])
    ]);

    it('hides applications with nothing usable by default', () => {
      expect(visibleApplications(stencil, false).map(a => a.name)).to.deep.equal([
        'Current',
        'Mixed'
      ]);
    });

    it('lists every application when deprecated versions are shown', () => {
      expect(visibleApplications(stencil, true).map(a => a.name)).to.deep.equal([
        'Current',
        'Mixed',
        'Old'
      ]);
    });
  });

  describe('upsertApplicationVersion', () => {
    it('adds a new application', () => {
      const result = upsertApplicationVersion(
        makeStencil(),
        info,
        makeVersion('1.0.0')
      );
      expect(result.applications).to.have.lengthOf(1);
      expect(result.applications[0]).to.include({
        category: 'Bus',
        name: 'BZ',
        description: 'new description'
      });
    });

    it('adds a new version to the existing application instead of a second application', () => {
      const stencil = makeStencil([
        makeApplication('Bus', 'BZ', [makeVersion('1.0.0')]),
        makeApplication('Bus', 'Other', [makeVersion('1.0.0')])
      ]);
      const result = upsertApplicationVersion(stencil, info, makeVersion('2.0.0'));

      expect(result.applications.map(a => a.name)).to.deep.equal(['BZ', 'Other']);
      expect(result.applications[0].versions.map(v => v.version)).to.deep.equal([
        '1.0.0',
        '2.0.0'
      ]);
    });

    it('replaces a version that already exists in place', () => {
      const stencil = makeStencil([
        makeApplication('Bus', 'BZ', [makeVersion('1.0.0'), makeVersion('2.0.0')])
      ]);
      const replacement = { ...makeVersion('1.0.0'), description: 'changed' };
      const result = upsertApplicationVersion(stencil, info, replacement);

      expect(result.applications).to.have.lengthOf(1);
      expect(result.applications[0].versions.map(v => v.description)).to.deep.equal([
        'changed',
        'version 2.0.0'
      ]);
    });

    it('keeps the application description when none is given', () => {
      const stencil = makeStencil([
        makeApplication('Bus', 'BZ', [makeVersion('1.0.0')])
      ]);
      const result = upsertApplicationVersion(
        stencil,
        { ...key, description: '' },
        makeVersion('2.0.0')
      );
      expect(result.applications[0].description).to.equal('BZ description');
    });

    it('treats the same name in another category as another application', () => {
      const stencil = makeStencil([
        makeApplication('Line', 'BZ', [makeVersion('1.0.0')])
      ]);
      const result = upsertApplicationVersion(stencil, info, makeVersion('1.0.0'));
      expect(result.applications).to.have.lengthOf(2);
    });

    it('does not change its inputs', () => {
      const stencil = makeStencil([
        makeApplication('Bus', 'BZ', [makeVersion('1.0.0')])
      ]);
      const before = JSON.stringify(stencil);
      upsertApplicationVersion(stencil, info, makeVersion('2.0.0'));
      expect(JSON.stringify(stencil)).to.equal(before);
    });
  });

  describe('removeApplicationVersion', () => {
    it('removes only the chosen version when others remain', () => {
      const stencil = makeStencil([
        makeApplication('Bus', 'BZ', [makeVersion('1.0.0'), makeVersion('2.0.0')])
      ]);
      const result = removeApplicationVersion(stencil, key, '2.0.0');
      expect(result.applications[0].versions.map(v => v.version)).to.deep.equal([
        '1.0.0'
      ]);
    });

    it('removes the application with its last version', () => {
      const stencil = makeStencil([
        makeApplication('Bus', 'BZ', [makeVersion('1.0.0')]),
        makeApplication('Bus', 'Other', [makeVersion('1.0.0')])
      ]);
      const result = removeApplicationVersion(stencil, key, '1.0.0');
      expect(result.applications.map(a => a.name)).to.deep.equal(['Other']);
    });

    it('leaves the stencil alone for a version that does not exist', () => {
      const stencil = makeStencil([
        makeApplication('Bus', 'BZ', [makeVersion('1.0.0')])
      ]);
      expect(removeApplicationVersion(stencil, key, '9.9.9')).to.deep.equal(stencil);
    });
  });

  it('knows whether an application version exists', () => {
    const stencil = makeStencil([
      makeApplication('Bus', 'BZ', [makeVersion('1.0.0')])
    ]);
    expect(hasApplicationVersion(stencil, key, '1.0.0')).to.be.true;
    expect(hasApplicationVersion(stencil, key, '2.0.0')).to.be.false;
    expect(hasApplicationVersion(stencil, { ...key, name: 'X' }, '1.0.0')).to.be
      .false;
  });

  it('renames a stencil without changing the original', () => {
    const stencil = makeStencil();
    const renamed = renameStencil(stencil, 'New', '2.0');
    expect(renamed).to.include({ name: 'New', version: '2.0' });
    expect(stencil.name).to.equal('My Stencil');
  });

  it('summarizes what a version configures', () => {
    const version = makeVersion('1.0.0');
    version.IEDS.Other = version.IEDS.Fn;
    version.ControlBlocks = [
      { id: 'a', name: 'a', from: 'Fn', to: 'Other', type: 'GSEControl', mappings: [{ FCDA: 'f', ExtRef: 'e' }, { FCDA: 'g', ExtRef: 'h' }], supervision: '>x' },
      { id: 'b', name: 'b', from: 'Fn', to: 'Other', type: 'SampledValueControl', mappings: [{ FCDA: 'f', ExtRef: 'e' }], supervision: 'None' }
    ];
    expect(summarizeVersion(version)).to.deep.equal({
      functions: 2,
      goose: 1,
      smv: 1,
      subscriptions: 3,
      supervisions: 1
    });
  });
  describe('editing', () => {
    const stencil = makeStencil([
      makeApplication('Bus', 'BZ', [makeVersion('1.0.0'), makeVersion('2.0.0')]),
      makeApplication('Bus', 'Other', [makeVersion('1.0.0')])
    ]);

    it('renames an application and refuses a name already used', () => {
      const renamed = updateApplication(stencil, key, {
        category: ' Line ',
        name: 'Zone',
        description: 'd'
      });
      expect(renamed.applications[0]).to.include({
        category: 'Line',
        name: 'Zone',
        description: 'd'
      });
      expect(stencil.applications[0].name).to.equal('BZ');

      const clash = { category: 'Bus', name: 'Other', description: '' };
      expect(applicationProblem(stencil, key, clash)).to.be.a('string');
      expect(updateApplication(stencil, key, clash)).to.equal(stencil);
      expect(applicationProblem(stencil, key, { ...key })).to.equal(null);
      expect(
        applicationProblem(stencil, key, { category: '', name: 'x' })
      ).to.be.a('string');
    });

    it('changes a version and refuses one that exists', () => {
      const next = updateVersion(stencil, key, '1.0.0', {
        version: '1.1.0',
        description: 'new',
        deprecated: true
      });
      expect(next.applications[0].versions[0]).to.include({
        version: '1.1.0',
        description: 'new',
        deprecated: true
      });
      expect(versionProblem(stencil, key, '1.0.0', '2.0.0')).to.be.a('string');
      expect(versionProblem(stencil, key, '1.0.0', '1.0.0')).to.equal(null);
      expect(versionProblem(stencil, key, '1.0.0', ' ')).to.be.a('string');
      expect(
        updateVersion(stencil, key, '1.0.0', {
          version: '2.0.0',
          description: '',
          deprecated: false
        })
      ).to.equal(stencil);
    });

    it('renames a function in place and in the control blocks', () => {
      const version = {
        ...makeVersion('1.0.0'),
        IEDS: {
          A: makeVersion('1.0.0').IEDS.Fn,
          B: makeVersion('1.0.0').IEDS.Fn
        },
        ControlBlocks: [{ from: 'A', to: 'B' }, { from: 'B', to: 'A' }] as never
      };
      const renamed = renameFunction(version, 'A', 'Publisher');
      expect(Object.keys(renamed.IEDS)).to.deep.equal(['Publisher', 'B']);
      expect(renamed.ControlBlocks.map(cb => [cb.from, cb.to])).to.deep.equal([
        ['Publisher', 'B'],
        ['B', 'Publisher']
      ]);
      expect(functionProblem(version, 'A', 'B')).to.be.a('string');
      expect(functionProblem(version, 'A', ' ')).to.be.a('string');
      expect(renameFunction(version, 'A', 'B')).to.equal(version);
      expect(renameFunction(version, 'Missing', 'C')).to.equal(version);
    });

    it('changes what a function requires', () => {
      const version = makeVersion('1.0.0');
      const next = updateRequirement(version, 'Fn', {
        manufacturer: 'ABB',
        type: 'REL',
        id: 'X',
        idVersion: '2.0.0'
      });
      expect(next.IEDS.Fn).to.include({ manufacturer: 'ABB', type: 'REL' });
      expect(next.IEDS.Fn.privates).to.deep.equal([
        { 'OpenSCD-Stencil-Id': 'X', 'OpenSCD-Stencil-Version': '2.0.0' }
      ]);
      expect(
        updateRequirement(version, 'Nope', {
          manufacturer: '',
          type: '',
          id: '',
          idVersion: ''
        })
      ).to.equal(version);
    });

    it('removes an application with its versions', () => {
      const result = removeApplication(stencil, key);
      expect(result.applications.map(app => app.name)).to.deep.equal(['Other']);
      expect(stencil.applications).to.have.lengthOf(2);
    });

    it('compares what will be written, so a trailing space cannot merge or duplicate', () => {
      const version = {
        ...makeVersion('1.0.0'),
        IEDS: { A: makeVersion('1.0.0').IEDS.Fn, B: makeVersion('1.0.0').IEDS.Fn }
      };
      expect(functionProblem(version, 'A', 'B ')).to.be.a('string');
      expect(renameFunction(version, 'A', 'B ')).to.equal(version);
      expect(functionProblem(version, 'A', 'A ')).to.equal(null);
      expect(versionProblem(stencil, key, '1.0.0', '2.0.0 ')).to.be.a('string');
      expect(
        applicationProblem(stencil, key, { category: 'Bus ', name: 'Other ' })
      ).to.be.a('string');
    });

    it('accepts function names that are also names of Object properties', () => {
      const version = makeVersion('1.0.0');
      expect(functionProblem(version, 'Fn', 'constructor')).to.equal(null);
      expect(functionProblem(version, 'Fn', 'toString')).to.equal(null);
      expect(Object.keys(renameFunction(version, 'Fn', 'constructor').IEDS)).to.deep.equal(['constructor']);
    });

    it('leaves a function untagged when both tag fields are emptied', () => {
      const next = updateRequirement(makeVersion('1.0.0'), 'Fn', {
        manufacturer: 'M',
        type: 'T',
        id: ' ',
        idVersion: ''
      });
      expect(next.IEDS.Fn.privates).to.deep.equal([]);
    });

    it('replaces a version', () => {
      const next = { ...makeVersion('1.0.0'), description: 'changed' };
      const result = replaceVersion(stencil, key, '1.0.0', next);
      expect(result.applications[0].versions[0].description).to.equal('changed');
      expect(result.applications[0].versions[1].version).to.equal('2.0.0');
    });
  });
});

