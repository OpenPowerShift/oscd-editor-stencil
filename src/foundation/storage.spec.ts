import { expect } from '@open-wc/testing';

import { STORAGE_KEY, loadStoredStencil, newStencil, storeStencil } from './storage.js';
import { makeApplication, makeStencil, makeVersion } from '../testing/stencils.js';

const memory = (initial?: string) => {
  const items = new Map<string, string>(initial ? [[STORAGE_KEY, initial]] : []);
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    items
  };
};

describe('storage', () => {
  it('gives a new empty stencil each time, so changing one cannot affect another', () => {
    const first = newStencil();
    first.name = 'changed';
    expect(newStencil().name).to.equal('Please name your Stencil');
  });

  it('loads an empty stencil when nothing is stored', () => {
    expect(loadStoredStencil(memory())).to.deep.equal(newStencil());
  });

  it('stores and loads a stencil, in the key earlier versions used', () => {
    const storage = memory();
    const stencil = makeStencil([makeApplication('Bus', 'BZ', [makeVersion('1.0.0')])]);
    expect(storeStencil(stencil, storage)).to.be.true;
    expect(storage.items.has('oscd-stencil')).to.be.true;
    expect(loadStoredStencil(storage).applications).to.deep.equal(stencil.applications);
  });

  it('loads a stencil stored by an earlier version of the plugin', () => {
    const old = JSON.stringify(makeStencil([makeApplication('Bus', 'BZ', [makeVersion('1.0.0')])]));
    expect(loadStoredStencil(memory(old)).applications).to.have.lengthOf(1);
  });

  it('falls back to an empty stencil for damaged or invalid contents', () => {
    expect(loadStoredStencil(memory('{ nope'))).to.deep.equal(newStencil());
    expect(loadStoredStencil(memory('{"name": 5}'))).to.deep.equal(newStencil());
  });

  it('copes with storage that is unavailable', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      }
    };
    expect(loadStoredStencil(blocked)).to.deep.equal(newStencil());
    expect(storeStencil(newStencil(), blocked)).to.be.false;
  });
});
