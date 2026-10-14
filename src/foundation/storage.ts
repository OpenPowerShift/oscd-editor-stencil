import type { StencilData } from './types.js';

/** Where earlier versions of the plugin kept their single stencil. The library takes it over. */
export const STORAGE_KEY = 'oscd-stencil';

/** An empty stencil. A new object each time, so it is safe to change. */
export function newStencil(): StencilData {
  return { name: 'Please name your Stencil', version: '0.0.1', applications: [] };
}
