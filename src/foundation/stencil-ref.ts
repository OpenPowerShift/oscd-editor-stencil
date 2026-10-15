import { find, identity } from '@openscd/scl-lib';

import { findIed } from './match.js';

/** Element types a stencil refers to. */
export type RefTag =
  | 'GSEControl'
  | 'SampledValueControl'
  | 'FCDA'
  | 'ExtRef'
  | 'LN';

function iedNameOf(element: Element): string {
  return element.closest('IED')?.getAttribute('name') ?? '';
}

/**
 * The identity of an element without its IED name, as stored in a stencil:
 * scl-lib's `identity()` with the IED name removed.
 *
 * An ExtRef with `intAddr` (later binding) is `<Inputs identity>>intAddr[n]`.
 * An ExtRef without it is identified by the signal it refers to, which is how
 * IEC 61850-6 identifies it too (`uniqueExtRefInInputs`).
 */
export function toRef(element: Element): string {
  return `${identity(element)}`.substring(iedNameOf(element).length);
}

/** Whether an ExtRef reference is by `intAddr`, so it names an ExtRef that already exists. */
export function isLaterBindingRef(ref: string): boolean {
  return ref.endsWith(']');
}

/**
 * The `Inputs` of an ExtRef reference, as the identity of its logical node.
 * The signal in the rest of the reference is not used: where an ExtRef
 * without `intAddr` is concerned, only the logical node is a location, and
 * the signal itself is worked out from the control block that is subscribed.
 */
export function inputsRef(ref: string): string {
  return ref.substring(0, ref.lastIndexOf('>'));
}

/** The element a stored reference points at on the given IED, if any. */
export function resolveRef(
  doc: XMLDocument,
  tag: RefTag,
  iedName: string,
  ref: string
): Element | null {
  // searching the IED alone is much faster than the whole document
  return find(findIed(doc, iedName) ?? doc, tag, `${iedName}${ref}`);
}

/**
 * Where a subscription is made on the given IED: the existing ExtRef for a
 * later binding reference, otherwise the `Inputs` (or the logical node, if
 * it has none yet) in which a new ExtRef is created.
 */
export function resolveSink(
  doc: XMLDocument,
  iedName: string,
  ref: string
): Element | null {
  if (isLaterBindingRef(ref)) {
    return resolveRef(doc, 'ExtRef', iedName, ref);
  }

  const owner = `${iedName}${inputsRef(ref)}`;
  const ied = findIed(doc, iedName) ?? doc;
  return (
    find(ied, 'Inputs', owner) ??
    find(ied, 'LN0', owner) ??
    find(ied, 'LN', owner)
  );
}
