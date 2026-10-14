import { getReference } from '@openscd/scl-lib';
import type { EditV2 } from '@openscd/oscd-api';

export const STENCIL_ID = 'OpenSCD-Stencil-Id';
export const STENCIL_VERSION = 'OpenSCD-Stencil-Version';

function tagElement(ied: Element, type: string): Element | null {
  return ied.querySelector(`:scope > Private[type="${type}"]`);
}

/** The stencil Id and version recorded on an IED, if both are present. */
export function readIedTag(
  ied: Element
): { id: string; version: string } | null {
  const id = tagElement(ied, STENCIL_ID)?.textContent;
  const version = tagElement(ied, STENCIL_VERSION)?.textContent;
  return id && version ? { id, version } : null;
}

/**
 * Edits that record a stencil Id and version on an IED. An existing tag is
 * updated in place, otherwise it is inserted.
 */
export function tagIedEdits(
  ied: Element,
  id: string,
  version: string
): EditV2[] {
  const doc = ied.ownerDocument;
  const reference = getReference(ied, 'Private');

  return [
    [STENCIL_ID, id.trim()],
    [STENCIL_VERSION, version.trim()]
  ].flatMap(([type, value]): EditV2[] => {
    const existing = tagElement(ied, type);
    if (existing) {
      return existing.textContent === value
        ? []
        : [{ element: existing, textContent: value }];
    }

    const node = doc.createElementNS(doc.documentElement.namespaceURI, 'Private');
    node.setAttribute('type', type);
    node.textContent = value;
    return [{ parent: ied, node, reference }];
  });
}
