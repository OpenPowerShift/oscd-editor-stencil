import { msg, str } from '@lit/localize';

import { readIedTag } from './ied-tags.js';
import type { Application, IedRequirement } from './types.js';

/** Written to a stencil when the IED it was captured from had no tag. */
const NO_ID = 'No Stencil Id Found';
const NO_VERSION = 'No Stencil Version Found';

type Tag = { id: string; version: string };

/** The stencil tags an IED must carry to fill a function, if any. */
export function requiredTags(requirement: IedRequirement): Tag[] {
  return requirement.privates
    .map(priv => ({
      id: priv['OpenSCD-Stencil-Id'],
      version: priv['OpenSCD-Stencil-Version']
    }))
    .filter(
      tag =>
        tag.id.trim() !== '' &&
        tag.version.trim() !== '' &&
        tag.id !== NO_ID &&
        tag.version !== NO_VERSION
    );
}

/** A readable form of what a function needs, such as `SIEMENS 7SS85, tagged BZ 1.0.0`. */
export function describeRequirement(requirement: IedRequirement): string {
  const tags = requiredTags(requirement);
  const kind = `${requirement.manufacturer} ${requirement.type}`;
  if (tags.length === 0) {
    return kind;
  }
  const tagged = tags.map(tag => `${tag.id} ${tag.version}`).join(msg(' or '));
  return msg(str`${kind}, tagged ${tagged}`);
}

function sameKind(ied: Element, requirement: IedRequirement): boolean {
  return (
    ied.getAttribute('type') === requirement.type &&
    ied.getAttribute('manufacturer') === requirement.manufacturer
  );
}

function hasRequiredTag(ied: Element, requirement: IedRequirement): boolean {
  const tags = requiredTags(requirement);
  if (tags.length === 0) {
    return true;
  }

  const own = readIedTag(ied);
  return (
    own !== null &&
    tags.some(tag => tag.id === own.id && tag.version === own.version)
  );
}

const iedsOf = (doc: XMLDocument): Element[] =>
  Array.from(doc.querySelectorAll(':root > IED'));

/**
 * The IEDs that can fill a function: the right manufacturer and type, the
 * required stencil tag, and not already used by another function.
 */
export function candidateIeds(
  doc: XMLDocument,
  requirement: IedRequirement,
  taken: ReadonlySet<string> = new Set()
): Element[] {
  return iedsOf(doc).filter(
    ied =>
      sameKind(ied, requirement) &&
      hasRequiredTag(ied, requirement) &&
      !taken.has(ied.getAttribute('name') ?? '')
  );
}

/** Why no IED can fill a function, or `null` when one can. */
export function noCandidateReason(
  doc: XMLDocument,
  requirement: IedRequirement,
  taken: ReadonlySet<string> = new Set()
): string | null {
  if (candidateIeds(doc, requirement, taken).length > 0) {
    return null;
  }

  const ofKind = iedsOf(doc).filter(ied => sameKind(ied, requirement));
  const kind = `${requirement.manufacturer} ${requirement.type}`;
  if (ofKind.length === 0) {
    return msg(str`No ${kind} IED in this file`);
  }

  if (!ofKind.some(ied => hasRequiredTag(ied, requirement))) {
    const count = ofKind.length;
    const tagged = requiredTags(requirement)
      .map(tag => `${tag.id} ${tag.version}`)
      .join(msg(' or '));
    return count === 1
      ? msg(str`1 ${kind} IED found, but none is tagged ${tagged}`)
      : msg(str`${count} ${kind} IEDs found, but none is tagged ${tagged}`);
  }
  return msg('Every matching IED is used by another function');
}

/** The functions of a version, in the order they are listed. */
export function functionNames(version: Application): string[] {
  return Object.keys(version.IEDS).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
}

/**
 * Assigns an IED to every unassigned function that has exactly one
 * candidate. Choosing one IED can leave another function with a single
 * candidate, so this repeats until nothing changes. Choices already made
 * are kept.
 */
export function autoAssign(
  doc: XMLDocument,
  version: Application,
  current: ReadonlyMap<string, string> = new Map()
): Map<string, string> {
  const assigned = new Map(current);
  const names = functionNames(version);

  let changed = true;
  while (changed) {
    changed = false;
    const taken = new Set(assigned.values());

    names
      .filter(name => !assigned.has(name))
      .forEach((name) => {
        const candidates = candidateIeds(doc, version.IEDS[name], taken);
        if (candidates.length === 1) {
          const iedName = candidates[0].getAttribute('name')!;
          assigned.set(name, iedName);
          taken.add(iedName);
          changed = true;
        }
      });
  }
  return assigned;
}
