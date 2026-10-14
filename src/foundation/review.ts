import type { ControlBlockInfo } from './mapping-info.js';
import { isPositionalRef } from './stencil-ref.js';

export type PositionalExtRef = {
  controlBlock: string;
  from: string;
  to: string;
  extRef: string;
};

/**
 * The ExtRefs of a stencil that are found by position because they have no
 * `intAddr`. They only resolve on an IED with the same ExtRefs in the same
 * order, typically one from the same ICD template.
 */
export function positionalExtRefs(
  controlBlocks: ControlBlockInfo[]
): PositionalExtRef[] {
  return controlBlocks.flatMap(cb =>
    [...cb.mappings.map(mapping => mapping.ExtRef), cb.selSupervision?.ExtRef]
      .filter((ref): ref is string => ref !== undefined && isPositionalRef(ref))
      .map(extRef => ({
        controlBlock: cb.name,
        from: cb.from,
        to: cb.to,
        extRef
      }))
  );
}
