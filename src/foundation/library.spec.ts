import { expect } from '@open-wc/testing';

import {
  LIBRARY_KEY,
  addStencil,
  copyName,
  loadLibrary,
  recentFirst,
  removeStencilEntry,
  storeLibrary,
  updateStencilEntry,
  useStencilEntry
} from './library.js';
import { STORAGE_KEY } from './storage.js';
import { makeApplication, makeStencil, makeVersion } from '../testing/stencils.js';

const memory = (initial: Record<string, string> = {}) => {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    items
  };
};

let counter = 0;
const newId = () => `id${(counter += 1)}`;
const stencilV = (version: string) => ({ ...makeStencil(), version });

describe('library', () => {
  it('lists the most recently used first', () => {
    let { library } = addStencil([], stencilV('1.0.0'), 10, newId);
    ({ library } = addStencil(library, stencilV('2.0.0'), 20, newId));
    expect(recentFirst(library).map(e => e.stencil.version)).to.deep.equal(['2.0.0', '1.0.0']);

    library = useStencilEntry(library, recentFirst(library)[1].id, 30);
    expect(recentFirst(library).map(e => e.stencil.version)).to.deep.equal(['1.0.0', '2.0.0']);
  });

  it('replaces a stencil with the same name and version, keeping its id', () => {
    const first = addStencil([], stencilV('1.0.0'), 10, newId);
    const changed = { ...stencilV('1.0.0'), applications: [makeApplication('a', 'b', [makeVersion('1')])] };
    const second = addStencil(first.library, changed, 50, newId);

    expect(second.id).to.equal(first.id);
    expect(second.library).to.have.lengthOf(1);
    expect(second.library[0].lastUsed).to.equal(50);
    expect(second.library[0].stencil.applications).to.have.lengthOf(1);
  });

  it('updates and removes entries', () => {
    const { library, id } = addStencil([], stencilV('1.0.0'), 10, newId);
    const updated = updateStencilEntry(library, id, stencilV('1.1.0'));
    expect(updated[0].stencil.version).to.equal('1.1.0');
    expect(updated[0].lastUsed).to.equal(10);
    expect(removeStencilEntry(updated, id)).to.deep.equal([]);
  });

  it('stores and loads the library', () => {
    const storage = memory();
    const { library } = addStencil(
      [],
      makeStencil([makeApplication('Bus', 'BZ', [makeVersion('1.0.0')])]),
      7,
      newId
    );
    expect(storeLibrary(library, storage)).to.be.true;
    const loaded = loadLibrary(storage);
    expect(loaded).to.have.lengthOf(1);
    expect(loaded[0].lastUsed).to.equal(7);
    expect(loaded[0].stencil.applications[0].name).to.equal('BZ');
  });

  it('imports the stencil of earlier versions when there is no library', () => {
    const legacy = JSON.stringify(makeStencil([makeApplication('Bus', 'BZ', [makeVersion('1.0.0')])]));
    const loaded = loadLibrary(memory({ [STORAGE_KEY]: legacy }), newId);
    expect(loaded).to.have.lengthOf(1);
    expect(loaded[0].stencil.applications).to.have.lengthOf(1);
  });

  it('does not bring the earlier stencil back once there is a library', () => {
    const legacy = JSON.stringify(makeStencil());
    const storage = memory({ [STORAGE_KEY]: legacy });
    storeLibrary([], storage);
    expect(loadLibrary(storage)).to.deep.equal([]);
  });

  it('is empty when nothing is stored, damaged or invalid, or storage is blocked', () => {
    expect(loadLibrary(memory())).to.deep.equal([]);
    expect(loadLibrary(memory({ [LIBRARY_KEY]: '{ nope' }))).to.deep.equal([]);
    expect(loadLibrary(memory({ [LIBRARY_KEY]: '{"entries": 5}' }))).to.deep.equal([]);
    expect(
      loadLibrary(memory({ [LIBRARY_KEY]: '{"entries": [{"id": "a", "stencil": {"name": 5}}, null]}' }))
    ).to.deep.equal([]);

    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      }
    };
    expect(loadLibrary(blocked)).to.deep.equal([]);
    expect(storeLibrary([], blocked)).to.be.false;
  });

  it('copes with a browser that does not give access to local storage', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      }
    });
    try {
      expect(loadLibrary()).to.deep.equal([]);
      expect(storeLibrary([])).to.be.false;
    } finally {
      Object.defineProperty(window, 'localStorage', original);
    }
  });

  it('names a copy so that it does not clash', () => {
    let { library } = addStencil([], stencilV('1.0.0'), 1, newId);
    expect(copyName(library, stencilV('1.0.0'))).to.equal('My Stencil (2)');
    ({ library } = addStencil(library, { ...stencilV('1.0.0'), name: 'My Stencil (2)' }, 2, newId));
    expect(copyName(library, stencilV('1.0.0'))).to.equal('My Stencil (3)');
  });
});
