import { expect } from '@open-wc/testing';

import {
  buildMatrix,
  cellKey,
  refLabel,
  supervisionLabel
} from './mapping-matrix.js';
import type { ControlBlockInfo } from './mapping-info.js';

const block = (
  from: string,
  to: string,
  id: string,
  type = 'GSEControl',
  supervision = 'None'
): ControlBlockInfo => ({
  id,
  name: id.split('>').pop()!,
  from,
  to,
  type,
  mappings: [{ FCDA: 'f', ExtRef: 'e' }],
  supervision
});

describe('mapping-matrix', () => {
  it('labels references readably', () => {
    expect(refLabel('>>LD0>GC1')).to.equal('LD0 › GC1');
    expect(refLabel('>>LD0> LGOS 1')).to.equal('LD0 › LGOS 1');
    expect(supervisionLabel('None')).to.equal('None');
    expect(supervisionLabel('>>LD0> LSVS 2')).to.equal('LD0 › LSVS 2');
  });

  it('builds a key from the function names and the control block', () => {
    expect(cellKey('A', 'B', 'GC1')).to.equal('A|B|GC1');
  });

  it('is empty without control blocks', () => {
    expect(buildMatrix([])).to.deep.equal({ columns: [], rows: [] });
  });

  describe('a stencil version', () => {
    const matrix = buildMatrix([
      block('Pub', 'Sub 2', '>>LD0>GC1'),
      block('Pub', 'sub 1', '>>LD0>GC1'),
      block('Pub', 'sub 1', '>>LD0>SV1', 'SampledValueControl', '>>LD0> LSVS 1'),
      block('Sub 2', 'Pub', '>>LD0>GC9')
    ]);

    it('has a column for every subscriber, in name order regardless of case', () => {
      expect(matrix.columns).to.deep.equal(['Pub', 'sub 1', 'Sub 2']);
    });

    it('has a row for every publisher with its control blocks in order', () => {
      expect(matrix.rows.map(r => r.from)).to.deep.equal(['Pub', 'Sub 2']);
      expect(matrix.rows[0].blocks.map(b => b.label)).to.deep.equal([
        'LD0 › GC1',
        'LD0 › SV1'
      ]);
    });

    it('puts each control block in the column of the function that subscribes to it', () => {
      const [gc1, sv1] = matrix.rows[0].blocks;
      expect(gc1.cells.map(c => c?.key ?? null)).to.deep.equal([
        null,
        'Pub|sub 1|GC1',
        'Pub|Sub 2|GC1'
      ]);
      expect(sv1.cells.map(c => c?.block.type ?? null)).to.deep.equal([
        null,
        'SampledValueControl',
        null
      ]);
    });

    it('keeps the control block with its details', () => {
      expect(matrix.rows[0].blocks[1].cells[1]?.block.supervision).to.equal(
        '>>LD0> LSVS 1'
      );
    });
  });
});
