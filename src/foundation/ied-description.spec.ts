import { expect } from '@open-wc/testing';

import { getIedDescription } from './ied-description.js';

const ied = (attrs: Record<string, string>) => {
  const element = document.createElement('IED');
  Object.entries(attrs).forEach(([k, v]) => element.setAttribute(k, v));
  return element;
};

describe('getIedDescription', () => {
  it('joins manufacturer and type, and describes the configuration', () => {
    expect(
      getIedDescription(
        ied({
          manufacturer: 'SIEMENS',
          type: '7SS85',
          desc: 'Bus',
          configVersion: 'V1',
          originalSclVersion: '2007',
          originalSclRevision: 'B',
          originalSclRelease: '4'
        })
      )
    ).to.deep.equal({
      firstLine: 'SIEMENS - 7SS85',
      secondLine: 'Bus - V1 - 2007B4'
    });
  });

  it('skips attributes that are missing', () => {
    expect(getIedDescription(ied({ type: 'X' }))).to.deep.equal({
      firstLine: 'X',
      secondLine: ''
    });
  });

  it('does not leave a trailing separator when there is no schema information', () => {
    expect(getIedDescription(ied({ desc: 'Bus' })).secondLine).to.equal('Bus');
    expect(
      getIedDescription(ied({ desc: 'Bus', configVersion: 'V1' })).secondLine
    ).to.equal('Bus - V1');
  });
});
