import type { ControlBlockInfo } from './mapping-info.js';

/** One control block sent from a function to another. */
export type MatrixCell = { block: ControlBlockInfo; key: string };

/** A control block of a publishing function, with a cell for each subscriber. */
export type MatrixBlock = {
  id: string;
  label: string;
  cells: (MatrixCell | null)[];
};

export type MatrixRow = { from: string; blocks: MatrixBlock[] };

/** The control blocks of a stencil version laid out as publisher by subscriber. */
export type Matrix = { columns: string[]; rows: MatrixRow[] };

const byName = (a: string, b: string): number =>
  a.toLowerCase().localeCompare(b.toLowerCase());

const unique = (names: string[]): string[] =>
  names.filter((name, i) => names.indexOf(name) === i);

/** Identifies one cell, for example to attach what applying did to it. */
export function cellKey(from: string, to: string, controlBlock: string): string {
  return `${from}|${to}|${controlBlock}`;
}

/** A readable form of a stored reference: `>>LD0>GC1` becomes `LD0 › GC1`. */
export function refLabel(ref: string): string {
  return ref
    .replace(/^>+/, '')
    .split('>')
    .map(part => part.trim())
    .join(' › ');
}

/** The supervision of a control block as `LD0 › LGOS 1`, or `None`. */
export function supervisionLabel(ref: string): string {
  return ref === 'None' ? 'None' : refLabel(ref);
}

/** Lays the control blocks out as rows of publishers and columns of subscribers. */
export function buildMatrix(blocks: ControlBlockInfo[]): Matrix {
  const columns = unique(blocks.map(block => block.to)).sort(byName);
  const publishers = unique(blocks.map(block => block.from)).sort(byName);

  const lookup = new Map<string, ControlBlockInfo>();
  blocks.forEach(block =>
    lookup.set(`${block.from}\u0000${block.id}\u0000${block.to}`, block)
  );

  return {
    columns,
    rows: publishers.map(from => ({
      from,
      blocks: unique(
        blocks.filter(block => block.from === from).map(block => block.id)
      )
        .sort(byName)
        .map(id => ({
          id,
          label: refLabel(id),
          cells: columns.map((to) => {
            const block = lookup.get(`${from}\u0000${id}\u0000${to}`);
            return block
              ? { block, key: cellKey(from, to, block.name) }
              : null;
          })
        }))
    }))
  };
}
