import { parseStencil, serializeStencil } from './stencil-io.js';
import type { StencilData } from './types.js';

/** Where the stencil is kept. Kept from earlier versions of the plugin. */
export const STORAGE_KEY = 'oscd-stencil';

/** An empty stencil. A new object each time, so it is safe to change. */
export function newStencil(): StencilData {
  return { name: 'Please name your Stencil', version: '0.0.1', applications: [] };
}

/** The stored stencil, or an empty one if there is none or it is unreadable. */
export function loadStoredStencil(
  storage: Pick<Storage, 'getItem'> = localStorage
): StencilData {
  try {
    const stored = storage.getItem(STORAGE_KEY);
    return (stored && parseStencil(stored).stencil) || newStencil();
  } catch {
    return newStencil();
  }
}

/** Keeps the stencil. @returns whether it could be stored. */
export function storeStencil(
  stencil: StencilData,
  storage: Pick<Storage, 'setItem'> = localStorage
): boolean {
  try {
    storage.setItem(STORAGE_KEY, serializeStencil(stencil));
    return true;
  } catch {
    return false;
  }
}
