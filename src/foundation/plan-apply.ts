import {
  controlBlockObjRef,
  find,
  instantiateSubscriptionSupervision,
  matchDataAttributes,
  subscribe
} from '@openscd/scl-lib';
import type { Connection } from '@openscd/scl-lib';
import type { EditV2, SetAttributes } from '@openscd/oscd-api';

import { combinations } from './combinations.js';
import { matchSrcAttributes } from './match.js';
import { resolveRef } from './stencil-ref.js';
import type { Application } from './types.js';

/** What applying a stencil does for one part of a control block. */
export type PartStatus = 'new' | 'present' | 'none' | 'error';

/** What applying a stencil does for one control block on the chosen IEDs. */
export type PlanItem = {
  controlBlock: string;
  type: 'GSEControl' | 'SampledValueControl';
  from: string;
  to: string;
  /** Subscriptions that will be made. */
  subscriptions: number;
  /** Subscriptions that already exist and are left alone. */
  present: number;
  supervision: PartStatus;
  /** The SEL message-quality ExtRef. */
  quality: PartStatus;
};

export type ApplyPlan = {
  /** All edits, computed against the document as it is now. */
  edits: EditV2[];
  /** Everything in the stencil that could not be resolved. */
  errors: string[];
  items: PlanItem[];
  subscriptions: number;
  supervisions: number;
  qualityLinks: number;
  /** Subscriptions, supervisions and quality links that already exist. */
  present: number;
};

/** The id of an element on a function's IED, as used in error messages. */
function newIedIdentity(iedName: string | undefined, id: string): string {
  return `${iedName}${id}`;
}

/** Whether an ExtRef is already subscribed to the FCDA of a control block. */
function isBound(sink: Element, fcda: Element, control: Element): boolean {
  return (
    sink.getAttribute('iedName') ===
      control.closest('IED')?.getAttribute('name') &&
    matchDataAttributes(sink, fcda) &&
    matchSrcAttributes(sink, control)
  );
}

/**
 * Computes the edits that apply an application version to the IEDs chosen
 * for its functions, without changing the document. Parts that already
 * exist are reported and left alone, so applying twice changes nothing.
 *
 * Every edit is computed against the current document, so the edits can be
 * committed together as one transaction. The subscription edits only touch
 * ExtRefs and the supervision edits only touch the supervision LN, so they
 * do not depend on each other. Two control blocks sharing one supervision LN
 * would, so that is reported as an error instead.
 */
export function planApply(
  doc: XMLDocument,
  application: Application,
  functionToIed: ReadonlyMap<string, string>
): ApplyPlan {
  const plan: ApplyPlan = {
    edits: [],
    errors: [],
    items: [],
    subscriptions: 0,
    supervisions: 0,
    qualityLinks: 0,
    present: 0
  };
  const usedSupervisionLns = new Set<Element>();

  [...combinations([...functionToIed.keys()], 2)].forEach(
    ([fn1, fn2]: string[]) => {
      const newIed1Name = functionToIed.get(fn1)!;
      const newIed2Name = functionToIed.get(fn2)!;

      application.ControlBlocks.filter(
        cb =>
          (cb.from === fn1 && cb.to === fn2) ||
          (cb.to === fn1 && cb.from === fn2)
      ).forEach((cb) => {
        const newFromIed = cb.from === fn1 ? newIed1Name : newIed2Name;
        const newToIed = cb.to === fn1 ? newIed1Name : newIed2Name;

        const newCbId = newIedIdentity(newFromIed, cb.id);
        const newCb = find(doc, cb.type as 'GSEControl', newCbId);
        if (!newCb) {
          plan.errors.push(`Could not find CB: ${newCbId}`);
          return;
        }

        const item: PlanItem = {
          controlBlock: newCb.getAttribute('name') ?? cb.name,
          type: cb.type as PlanItem['type'],
          from: newFromIed,
          to: newToIed,
          subscriptions: 0,
          present: 0,
          supervision: 'none',
          quality: 'none'
        };
        plan.items.push(item);

        const connections: Connection[] = [];
        cb.mappings.forEach((mapping) => {
          const newSource = resolveRef(doc, 'FCDA', newFromIed, mapping.FCDA);
          if (!newSource) {
            plan.errors.push(
              `Could not find FCDA: ${newIedIdentity(newFromIed, mapping.FCDA)}`
            );
            return;
          }

          const newSink = resolveRef(doc, 'ExtRef', newToIed, mapping.ExtRef);
          if (!newSink) {
            plan.errors.push(
              `Could not find ExtRef: ${newIedIdentity(newToIed, mapping.ExtRef)}`
            );
            return;
          }

          if (isBound(newSink, newSource, newCb)) {
            item.present += 1;
            return;
          }

          connections.push({
            sink: newSink,
            source: { fcda: newSource, controlBlock: newCb }
          });
        });
        item.subscriptions = connections.length;

        let selSupervision: SetAttributes | null = null;
        if (cb.selSupervision) {
          const qualExtRefId = newIedIdentity(
            newToIed,
            cb.selSupervision.ExtRef
          );
          const qualExtRef = resolveRef(
            doc,
            'ExtRef',
            newToIed,
            cb.selSupervision.ExtRef
          );

          if (!qualExtRef) {
            item.quality = 'error';
            plan.errors.push(
              `Could not find ExtRef for quality mapping: ${qualExtRefId}`
            );
          } else if (
            qualExtRef.getAttribute('iedName') === newFromIed &&
            matchSrcAttributes(qualExtRef, newCb)
          ) {
            item.quality = 'present';
          } else {
            item.quality = 'new';
            const logicalNode = newCb.closest('LN0, LN');
            const srcPrefix = logicalNode?.getAttribute('prefix') ?? '';
            const srcLNInst = logicalNode?.getAttribute('inst');

            selSupervision = {
              element: qualExtRef,
              attributes: {
                iedName: newFromIed,
                srcCBName: newCb.getAttribute('name'),
                srcLDInst: newCb.closest('LDevice')?.getAttribute('inst'),
                ...(srcPrefix && { srcPrefix }),
                srcLNClass: logicalNode?.getAttribute('lnClass'),
                ...(srcLNInst && { srcLNInst })
              }
            };
          }
        }

        plan.subscriptions += item.subscriptions;
        plan.present += item.present;
        if (item.quality === 'new') {
          plan.qualityLinks += 1;
        }
        if (item.quality === 'present') {
          plan.present += 1;
        }

        plan.edits.push(
          ...(selSupervision ? [selSupervision] : []),
          ...subscribe(connections, {
            force: true,
            ignoreSupervision: true,
            checkOnlyBType: true
          })
        );

        if (cb.supervision === 'None') {
          return;
        }

        const newSupervisionId = newIedIdentity(newToIed, cb.supervision);
        const newSupervision = resolveRef(doc, 'LN', newToIed, cb.supervision);
        if (!newSupervision) {
          item.supervision = 'error';
          plan.errors.push(`Could not find Supervision: ${newSupervisionId}`);
          return;
        }
        if (usedSupervisionLns.has(newSupervision)) {
          item.supervision = 'error';
          plan.errors.push(
            `Supervision used by more than one control block: ${newSupervisionId}`
          );
          return;
        }
        usedSupervisionLns.add(newSupervision);

        const cbRef = newSupervision.querySelector(
          ':scope > DOI > DAI[name="setSrcRef"] > Val'
        )?.textContent;
        if (cbRef && cbRef === controlBlockObjRef(newCb)) {
          item.supervision = 'present';
          plan.present += 1;
          return;
        }

        const supervision = instantiateSubscriptionSupervision(
          { subscriberIedOrLn: newSupervision, sourceControlBlock: newCb },
          {
            newSupervisionLn: false,
            fixedLnInst: -1,
            checkEditableSrcRef: false,
            checkDuplicateSupervisions: false,
            checkMaxSupervisionLimits: false
          }
        );
        if (!supervision) {
          item.supervision = 'error';
          plan.errors.push(
            `Could not instantiate supervision: ${newSupervisionId}`
          );
          return;
        }

        item.supervision = 'new';
        plan.supervisions += 1;
        plan.edits.push(supervision);
      });
    }
  );

  return plan;
}
