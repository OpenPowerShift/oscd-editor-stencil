import { getIedDescription } from './ied-description.js';
import { readIedTag } from './ied-tags.js';

/** An entry for an `oscd-selection-list`, one per IED. */
export type IedSelectItem = {
  headline: string;
  supportingText: string;
  attachedElement: Element;
  selected: boolean;
};

/**
 * One unselected list entry for each IED directly under the SCL root.
 *
 * The list keeps the selection in these objects, so build them once per
 * dialog opening and not on every render.
 *
 * With `withTags` the stencil Id and version recorded on the IED are appended.
 */
export function iedSelectItems(
  doc: XMLDocument | undefined,
  withTags = false
): IedSelectItem[] {
  return Array.from(doc?.querySelectorAll(':root > IED') ?? []).map((ied) => {
    const { firstLine, secondLine } = getIedDescription(ied);
    const tag = withTags ? readIedTag(ied) : null;

    return {
      headline: `${ied.getAttribute('name')!} — ${firstLine}`,
      supportingText: `${secondLine}${tag ? ` [${tag.id}, ${tag.version}]` : ''}`,
      attachedElement: ied,
      selected: false
    };
  });
}

/** A list that can be searched, as `oscd-selection-list` is. */
type Searchable = { searchRegex?: RegExp };

/**
 * The items a selection list shows for its current search, with the same
 * test the list uses, so that "select all" only selects what can be seen.
 */
export function visibleItems<T extends { headline: string; supportingText?: string }>(
  list: unknown,
  items: T[]
): T[] {
  const search = (list as Searchable | null)?.searchRegex;
  return search
    ? items.filter(item => search.test(`${item.headline} ${item.supportingText ?? ''}`))
    : items;
}
