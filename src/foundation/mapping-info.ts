import { controlBlockObjRef } from '@openscd/scl-lib';

import { toRef } from './stencil-ref.js';
import {
  findFcda,
  findIed,
  inputsOf,
  isSubscribed,
  isSubscribedTo,
  matchSrcAttributes
} from './match.js';

export type Mapping = {
  ExtRef: string;
  FCDA: string;
};

export type ControlBlockInfo = {
  id: string;
  name: string;
  from: string;
  to: string;
  baseFrom?: string;
  baseTo?: string;
  type: string;
  mappings: Mapping[];
  supervision: string;
  selSupervision?: {
    ExtRef: string;
    name: string;
  };
};

function isSELMessageQuality(extRef: Element): boolean {
  const isSEL =
    extRef.closest('IED')?.getAttribute('manufacturer') === 'SEL';
  return isSEL && !extRef.getAttribute('serviceType') && !isSubscribed(extRef);
}

/** The unsubscribed message-quality ExtRef of a SEL IED for a control block. */
function findSELMessageQuality(
  control: Element,
  fromIedName: string,
  toIed: Element
): Element | undefined {
  return inputsOf(toIed).find(
    extRef =>
      extRef.getAttribute('iedName') === fromIedName &&
      matchSrcAttributes(extRef, control) &&
      isSELMessageQuality(extRef)
  );
}

function findSupervision(cb: Element, ied: Element): Element | undefined {
  const lnClass = cb.tagName === 'GSEControl' ? 'LGOS' : 'LSVS';
  const cbRefType = lnClass === 'LGOS' ? 'GoCBRef' : 'SvCBRef';
  const objRef = controlBlockObjRef(cb);

  return (
    Array.from(
      ied.querySelectorAll(
        `LN[lnClass="${lnClass}"] > DOI[name="${cbRefType}"] > DAI[name="setSrcRef"] > Val`
      )
    )
      .find(val => val.textContent === objRef)
      ?.closest('LN') ?? undefined
  );
}

/**
 * The control blocks of one IED which another IED is subscribed to, with the
 * subscriptions, the supervision and any SEL message-quality ExtRef.
 *
 * An IED that does not exist has no mappings. An ExtRef whose data is not in
 * the control block's data set is not a working subscription and is skipped.
 */
export function getMappingInfo(
  doc: XMLDocument,
  fromName: string,
  toName: string,
  includeSELSupervision = true
): ControlBlockInfo[] {
  const fromIed = findIed(doc, fromName);
  const toIed = findIed(doc, toName);
  if (!fromIed || !toIed) {
    return [];
  }

  const subscribed = inputsOf(toIed).filter(
    extRef =>
      extRef.getAttribute('iedName') === fromName && isSubscribed(extRef)
  );

  const cbMappings: ControlBlockInfo[] = [];

  fromIed
    .querySelectorAll('GSEControl, SampledValueControl')
    .forEach((cb) => {
      const mappings = subscribed
        .filter(extRef => isSubscribedTo(extRef, cb))
        .flatMap((extRef) => {
          const fcda = findFcda(cb, extRef);
          return fcda
            ? [
              {
                FCDA: toRef(fcda),
                ExtRef: toRef(extRef)
              }
            ]
            : [];
        });
      if (mappings.length === 0) {
        return;
      }

      const supLn = findSupervision(cb, toIed) ?? null;

      const selMqExtRef = includeSELSupervision
        ? findSELMessageQuality(cb, fromName, toIed)
        : undefined;

      cbMappings.push({
        id: toRef(cb),
        name: cb.getAttribute('name')!,
        from: fromName,
        to: toName,
        type: cb.tagName,
        mappings,
        supervision: supLn ? toRef(supLn) : 'None',
        ...(selMqExtRef && {
          selSupervision: {
            name: selMqExtRef.getAttribute('intAddr') ?? 'No internal address!!',
            ExtRef: toRef(selMqExtRef)
          }
        })
      });
    });

  return cbMappings;
}
