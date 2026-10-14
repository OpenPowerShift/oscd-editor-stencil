import { expect } from '@open-wc/testing';

import { STORAGE_KEY, newStencil } from './storage.js';

describe('storage', () => {
  it('gives a new empty stencil each time, so changing one cannot affect another', () => {
    const first = newStencil();
    first.name = 'changed';
    expect(newStencil().name).to.equal('Please name your Stencil');
    expect(newStencil().applications).to.deep.equal([]);
  });

  it('keeps the key earlier versions used', () => {
    expect(STORAGE_KEY).to.equal('oscd-stencil');
  });
});
