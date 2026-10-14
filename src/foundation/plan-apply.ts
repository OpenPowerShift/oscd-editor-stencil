import {
  find,
  instantiateSubscriptionSupervision,
  subscribe
} from '@openscd/scl-lib';
import type { Connection } from '@openscd/scl-lib';
import type { EditV2, SetAttributes } from '@openscd/oscd-api';

import { combinations } from './combinations.js';
import { resolveRef } from './stencil-ref.js';
import type { Application } from './types.js';

export type ApplyPlan = {
  /** All edits, computed against the document as it is now. */
  edits: EditV2[];
  /** Everything in the stencil that could not be resolved. */
  errors: string[];
  subscriptions: number;
  supervisions: number;
};

/** The id of an element on a function's IED, as used in error messages. */
function newIedIdentity(iedName: string | undefined, id: string): string {
  return `${iedName}${id}`;
}

/**
 * Computes the edits that apply an application version to the IEDs chosen
 * for its functions, without changing the document.
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
    subscriptions: 0,
    supervisions: 0
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

          connections.push({
            sink: newSink,
            source: { fcda: newSource, controlBlock: newCb }
          });
        });

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
            plan.errors.push(
              `Could not find ExtRef for quality mapping: ${qualExtRefId}`
            );
          } else {
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

        plan.subscriptions += connections.length;
        // Counted once per control block, whether or not an LGOS/LSVS follows.
        plan.supervisions += 1;

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
          plan.errors.push(`Could not find Supervision: ${newSupervisionId}`);
          return;
        }
        if (usedSupervisionLns.has(newSupervision)) {
          plan.errors.push(
            `Supervision used by more than one control block: ${newSupervisionId}`
          );
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
          plan.errors.push(
            `Could not instantiate supervision: ${newSupervisionId}`
          );
          return;
        }

        usedSupervisionLns.add(newSupervision);
        plan.supervisions += 1;
        plan.edits.push(supervision);
      });
    }
  );

  return plan;
}
