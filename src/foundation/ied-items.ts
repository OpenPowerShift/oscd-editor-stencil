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
