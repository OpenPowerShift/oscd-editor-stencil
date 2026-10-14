import { combinations } from './combinations.js';
import { findIed, inputsOf } from './match.js';
import { getMappingInfo } from './mapping-info.js';
import type { ControlBlockInfo } from './mapping-info.js';
import { readIedTag } from './ied-tags.js';
import type { Application, IedRequirement } from './types.js';

/** What identifies a control block sent from one IED to another. */
export const blockKey = (block: ControlBlockInfo): string =>
  `${block.from}|${block.to}|${block.id}`;

/**
 * Every control block that one of the IEDs publishes and another of them is
 * subscribed to, in both directions between each pair.
 */
export function discoverControlBlocks(
  doc: XMLDocument,
  iedNames: string[]
): ControlBlockInfo[] {
  // an IED can only be subscribed to the IEDs its ExtRefs name, so the
  // pairs without one are not looked at: this keeps large selections fast
  const sources = new Map<string, Set<string>>(
    iedNames.map(name => [
      name,
      new Set(
        inputsOf(findIed(doc, name) ?? doc.createElement('IED'))
          .map(extRef => extRef.getAttribute('iedName'))
          .filter((source): source is string => source !== null)
      )
    ])
  );
  const subscribedTo = (from: string, to: string): ControlBlockInfo[] =>
    sources.get(to)?.has(from) ? getMappingInfo(doc, from, to) : [];

  return Array.from(combinations(iedNames, 2)).flatMap(([a, b]) => [
    ...subscribedTo(a, b),
    ...subscribedTo(b, a)
  ]);
}

/** The names of the IEDs that take part in the control blocks, sorted. */
export function involvedIeds(blocks: ControlBlockInfo[]): string[] {
  return [...new Set(blocks.flatMap(block => [block.from, block.to]))].sort(
    (a, b) => a.localeCompare(b)
  );
}

/** How much of a group of control blocks is chosen. */
export type CheckState = 'all' | 'some' | 'none';

export function checkState(
  blocks: ControlBlockInfo[],
  chosen: ReadonlySet<string>
): CheckState {
  const count = blocks.filter(block => chosen.has(blockKey(block))).length;
  if (count === 0) {
    return 'none';
  }
  return count === blocks.length ? 'all' : 'some';
}

/** The choice after a group is checked: all of it, or none when unchecked. */
export function setChosen(
  chosen: ReadonlySet<string>,
  blocks: ControlBlockInfo[],
  on: boolean
): Set<string> {
  const next = new Set(chosen);
  blocks.forEach(block =>
    on ? next.add(blockKey(block)) : next.delete(blockKey(block))
  );
  return next;
}

/** Function names for IEDs: the IED name, which the user can then change. */
export function suggestFunctionNames(iedNames: string[]): Record<string, string> {
  return Object.fromEntries(iedNames.map(name => [name, name]));
}

/** What is wrong with each function name, by IED name. Valid ones are absent. */
export function functionNameProblems(
  names: Record<string, string>
): Record<string, string> {
  const trimmed = Object.entries(names).map(
    ([ied, name]) => [ied, name.trim()] as const
  );
  return Object.fromEntries(
    trimmed.flatMap(([ied, name]) => {
      if (!name) {
        return [[ied, 'A function name is needed']];
      }
      const clash = trimmed.some(([other, n]) => other !== ied && n === name);
      return clash ? [[ied, 'Function names must be different']] : [];
    })
  );
}

/** The IEDs among these names that carry no stencil Id and version. */
export function untaggedIeds(doc: XMLDocument, iedNames: string[]): string[] {
  return iedNames.filter((name) => {
    const ied = doc.querySelector(`IED[name="${name}"]`);
    return ied && !readIedTag(ied);
  });
}

/** What the new version is called and said to be. */
export type VersionDetails = {
  version: string;
  description: string;
  deprecated: boolean;
};

/**
 * The application version made of the chosen control blocks, with the
 * functions named after the IEDs and requiring what each IED is.
 */
export function buildVersion(
  doc: XMLDocument,
  blocks: ControlBlockInfo[],
  names: Record<string, string>,
  details: VersionDetails
): Application {
  const functionOf = (ied: string): string => (names[ied] ?? ied).trim();

  const IEDS: Record<string, IedRequirement> = Object.create(null);
  involvedIeds(blocks).forEach((name) => {
    const ied = doc.querySelector(`IED[name="${name}"]`);
    if (!ied) {
      return;
    }
    const tag = readIedTag(ied);
    IEDS[functionOf(name)] = {
      originalName: name,
      type: ied.getAttribute('type') ?? '',
      manufacturer: ied.getAttribute('manufacturer') ?? '',
      privates: tag
        ? [
          {
            'OpenSCD-Stencil-Id': tag.id,
            'OpenSCD-Stencil-Version': tag.version
          }
        ]
        : []
    };
  });

  return {
    version: details.version.trim(),
    description: details.description,
    deprecated: details.deprecated,
    IEDS,
    ControlBlocks: blocks.map(block => ({
      ...block,
      from: functionOf(block.from),
      to: functionOf(block.to)
    }))
  };
}
