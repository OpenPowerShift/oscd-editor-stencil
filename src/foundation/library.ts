import { parseStencil, serializeStencil } from './stencil-io.js';
import { STORAGE_KEY } from './storage.js';
import type { StencilData } from './types.js';

/** Where the library is kept. The stencil of earlier versions stays in `STORAGE_KEY`. */
export const LIBRARY_KEY = 'oscd-stencil-library';

/** A stencil kept in the library. */
export type LibraryEntry = {
  id: string;
  stencil: StencilData;
  /** Milliseconds since the epoch of when it was last imported or used. */
  lastUsed: number;
};

/** The stencils that have been imported, in no particular order. */
export type Library = readonly LibraryEntry[];

/** The entries, the most recently used first. */
export function recentFirst(library: Library): LibraryEntry[] {
  return [...library].sort((a, b) => b.lastUsed - a.lastUsed);
}

const sameStencil = (a: StencilData, b: StencilData): boolean =>
  a.name === b.name && a.version === b.version;

/**
 * Adds a stencil. One with the same name and version is replaced and
 * keeps its id. Gives the library and the id of the stencil.
 */
export function addStencil(
  library: Library,
  stencil: StencilData,
  now: number,
  newId: () => string = () => crypto.randomUUID()
): { library: Library; id: string } {
  const existing = library.find(entry => sameStencil(entry.stencil, stencil));
  if (existing) {
    return {
      id: existing.id,
      library: library.map(entry =>
        entry === existing ? { ...entry, stencil, lastUsed: now } : entry
      )
    };
  }
  const id = newId();
  return { id, library: [...library, { id, stencil, lastUsed: now }] };
}

/** Marks a stencil as used now. */
export function useStencilEntry(
  library: Library,
  id: string,
  now: number
): Library {
  return library.map(entry =>
    entry.id === id ? { ...entry, lastUsed: now } : entry
  );
}

/** Replaces the contents of a stencil after it was edited. */
export function updateStencilEntry(
  library: Library,
  id: string,
  stencil: StencilData
): Library {
  return library.map(entry => (entry.id === id ? { ...entry, stencil } : entry));
}

/** Removes a stencil from the library. */
export function removeStencilEntry(library: Library, id: string): Library {
  return library.filter(entry => entry.id !== id);
}

type Stored = { libraryVersion: 1; entries: { id: string; lastUsed: number; stencil: unknown }[] };

function fromStored(value: unknown): LibraryEntry[] {
  const entries = (value as Partial<Stored> | null)?.entries;
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.flatMap((entry) => {
    const { stencil } = parseStencil(JSON.stringify(entry?.stencil));
    return stencil && typeof entry.id === 'string'
      ? [{ id: entry.id, stencil, lastUsed: Number(entry.lastUsed) || 0 }]
      : [];
  });
}

/**
 * The stored library. A stencil kept by earlier versions of the plugin is
 * included when there is no library yet, so existing users keep it.
 */
export function loadLibrary(
  storage: Pick<Storage, 'getItem'> = localStorage,
  newId: () => string = () => crypto.randomUUID()
): Library {
  try {
    const stored = storage.getItem(LIBRARY_KEY);
    if (stored) {
      return fromStored(JSON.parse(stored));
    }
    const legacy = storage.getItem(STORAGE_KEY);
    const { stencil } = legacy ? parseStencil(legacy) : { stencil: undefined };
    return stencil ? [{ id: newId(), stencil, lastUsed: Date.now() }] : [];
  } catch {
    return [];
  }
}

/** Keeps the library. Tells whether it could be stored. */
export function storeLibrary(
  library: Library,
  storage: Pick<Storage, 'setItem'> = localStorage
): boolean {
  try {
    const stored: Stored = {
      libraryVersion: 1,
      entries: library.map(entry => ({
        id: entry.id,
        lastUsed: entry.lastUsed,
        stencil: JSON.parse(serializeStencil(entry.stencil))
      }))
    };
    storage.setItem(LIBRARY_KEY, JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}
