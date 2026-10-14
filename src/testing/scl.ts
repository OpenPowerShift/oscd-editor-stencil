import type { ControlBlockInfo } from '../foundation/mapping-info.js';
import type { Application } from '../foundation/types.js';

/** Copies an IED under a new name, keeping only `intAddr` on its ExtRefs. */
export function cloneAsClean(doc: XMLDocument, from: string, name: string): Element {
  const copy = doc.querySelector(`IED[name="${from}"]`)!.cloneNode(true) as Element;
  copy.setAttribute('name', name);
  copy.querySelectorAll('ExtRef').forEach((extRef) => {
    Array.from(extRef.attributes)
      .map(attr => attr.name)
      .filter(attr => attr !== 'intAddr')
      .forEach(attr => extRef.removeAttribute(attr));
  });
  copy.querySelectorAll('LN Val').forEach((val) => {
    val.textContent = '';
  });
  doc.documentElement.appendChild(copy);
  return copy;
}

export function applicationFrom(
  controlBlocks: ControlBlockInfo[],
  from: string,
  to: string
): Application {
  return {
    version: '1.0.0',
    description: '',
    deprecated: false,
    IEDS: {},
    ControlBlocks: controlBlocks.map(cb => ({ ...cb, from, to }))
  };
}

