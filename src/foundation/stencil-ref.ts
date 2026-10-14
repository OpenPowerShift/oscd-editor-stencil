import { find, identity } from '@openscd/scl-lib';

/** Element types a stencil refers to. */
export type RefTag =
  | 'GSEControl'
  | 'SampledValueControl'
  | 'FCDA'
  | 'ExtRef'
  | 'LN';

/**
 * Separates the identity of an `Inputs` element from the position of an
 * ExtRef without `intAddr` among its siblings that also lack `intAddr`.
 */
const POSITION = '>#';

function iedNameOf(element: Element): string {
  return element.closest('IED')?.getAttribute('name') ?? '';
}

function withoutIed(id: string, iedName: string): string {
  return id.substring(iedName.length);
}

function hasNoIntAddr(element: Element): boolean {
  return element.tagName === 'ExtRef' && !element.hasAttribute('intAddr');
}

function extRefsWithoutIntAddr(inputs: Element): Element[] {
  return Array.from(inputs.children).filter(hasNoIntAddr);
}

/**
 * The identity of an element without its IED name, as stored in a stencil.
 *
 * It is scl-lib's `identity()` with the IED name removed, except for an
 * ExtRef without `intAddr`. scl-lib builds that from the current subscription,
 * which cannot be matched on another IED, so it is stored as the position
 * among the ExtRefs without `intAddr`: `<Inputs identity>>#<n>`.
 */
export function toRef(element: Element): string {
  const iedName = iedNameOf(element);
  if (hasNoIntAddr(element)) {
    const inputs = element.parentElement!;
    const position = extRefsWithoutIntAddr(inputs).indexOf(element);
    return `${withoutIed(`${identity(inputs)}`, iedName)}${POSITION}${position}`;
  }
  return withoutIed(`${identity(element)}`, iedName);
}

/** The element a stored reference points at on the given IED, if any. */
export function resolveRef(
  doc: XMLDocument,
  tag: RefTag,
  iedName: string,
  ref: string
): Element | null {
  const at = ref.lastIndexOf(POSITION);
  const position = at >= 0 ? ref.substring(at + POSITION.length) : '';

  if (tag === 'ExtRef' && /^\d+$/.test(position)) {
    const inputs = find(doc, 'Inputs', `${iedName}${ref.substring(0, at)}`);
    return inputs
      ? (extRefsWithoutIntAddr(inputs)[Number(position)] ?? null)
      : null;
  }
  return find(doc, tag, `${iedName}${ref}`);
}
