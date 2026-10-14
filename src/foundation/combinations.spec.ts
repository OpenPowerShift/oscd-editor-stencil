import { expect } from '@open-wc/testing';

import { combinations } from './combinations.js';

describe('combinations', () => {
  it('yields every pair once', () => {
    expect([...combinations(['a', 'b', 'c'], 2)]).to.deep.equal([
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'c']
    ]);
  });

  it('yields nothing for too few elements and singles for length 1', () => {
    expect([...combinations(['a'], 2)]).to.be.empty;
    expect([...combinations(['a', 'b'], 1)]).to.deep.equal([['a'], ['b']]);
  });
});
