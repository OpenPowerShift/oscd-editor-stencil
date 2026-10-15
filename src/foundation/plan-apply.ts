import {
  controlBlockObjRef,
  doesFcdaMeetExtRefRestrictions,
  find,
  instantiateSubscriptionSupervision,
  matchDataAttributes,
  subscribe
} from '@openscd/scl-lib';
import type { Connection } from '@openscd/scl-lib';
import type { EditV2, SetAttributes } from '@openscd/oscd-api';

import { combinations } from './combinations.js';
import {
  findIed,
  isSubscribed,
  isSubscribedTo,
  matchSrcAttributes
} from './match.js';
import { inputsRef, isLaterBindingRef, resolveRef, resolveSink } from './stencil-ref.js';
import type { Application } from './types.js';

/** What applying a stencil does for one part of a control block. */
export type PartStatus = 'new' | 'present' | 'none' | 'error';

/** What applying a stencil does for one control block on the chosen IEDs. */
export type PlanItem = {
  /** The control block as the stencil refers to it, such as `>>LD0>GC1`. */
  id: string;
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
  /** Whether part of the control block could not be applied. */
  failed: boolean;
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

/**
 * Whether the IED needs the system tool to bind its predefined inputs
 * (`ClientServices` attribute `noIctBinding="true"`, IEC 61850-6). Its IED
 * tool cannot bind an unbound external signal to an internal address, so an
 * ExtRef without `intAddr` created for it could not be used. Without the
 * attribute (the default) the IED tool accepts such ExtRefs and binds them.
 */
function onlyAcceptsPredefinedInputs(doc: XMLDocument, iedName: string): boolean {
  return (
    findIed(doc, iedName)?.querySelector(
      ':scope > Services > ClientServices[noIctBinding="true"], :scope > AccessPoint > Services > ClientServices[noIctBinding="true"]'
    ) != null
  );
}

/** The id of an element on a function's IED, as used in error messages. */
function newIedIdentity(iedName: string | undefined, id: string): string {
  return `${iedName}${id}`;
}

/** Whether an ExtRef is already subscribed to the FCDA of a control block. */
function binds(extRef: Element, fcda: Element, control: Element): boolean {
  return (
    extRef.getAttribute('iedName') ===
      control.closest('IED')?.getAttribute('name') &&
    matchDataAttributes(extRef, fcda) &&
    isSubscribedTo(extRef, control)
  );
}

/**
 * Whether the sink already holds a subscription to the FCDA. A sink is an
 * ExtRef with `intAddr`, or the `Inputs` or logical node in which an ExtRef
 * would be created, so any ExtRef there counts.
 */
function isBound(sink: Element, fcda: Element, control: Element): boolean {
  const extRefs =
    sink.tagName === 'ExtRef'
      ? [sink]
      : Array.from(
        sink.querySelectorAll(
          sink.tagName === 'Inputs'
            ? ':scope > ExtRef'
            : ':scope > Inputs > ExtRef'
        )
      );
  return extRefs.some(extRef => binds(extRef, fcda, control));
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
  // one call for everything, so an `Inputs` that has to be created is created once
  const allConnections: Connection[] = [];

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
        const newCb = find(
          findIed(doc, newFromIed) ?? doc,
          cb.type as 'GSEControl',
          newCbId
        );

        const item: PlanItem = {
          id: cb.id,
          controlBlock: newCb?.getAttribute('name') ?? cb.name,
          type: cb.type as PlanItem['type'],
          from: newFromIed,
          to: newToIed,
          subscriptions: 0,
          present: 0,
          supervision: 'none',
          quality: 'none',
          failed: !newCb
        };
        plan.items.push(item);
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
            item.failed = true;
            return;
          }

          if (
            !isLaterBindingRef(mapping.ExtRef) &&
            onlyAcceptsPredefinedInputs(doc, newToIed)
          ) {
            const message = `Cannot create ExtRef on ${newToIed}: it only accepts later binding (ClientServices noIctBinding)`;
            if (!plan.errors.includes(message)) {
              plan.errors.push(message);
            }
            item.failed = true;
            return;
          }

          const newSink = resolveSink(doc, newToIed, mapping.ExtRef);
          if (!newSink) {
            plan.errors.push(
              isLaterBindingRef(mapping.ExtRef)
                ? `Could not find ExtRef: ${newIedIdentity(newToIed, mapping.ExtRef)}`
                : `Could not find logical node for input: ${newIedIdentity(newToIed, inputsRef(mapping.ExtRef))}`
            );
            item.failed = true;
            return;
          }

          if (isBound(newSink, newSource, newCb)) {
            item.present += 1;
            return;
          }

          // an input prepared by the IED tool is only filled when it is free
          // and accepts the data: one bound to another source is not replaced
          if (newSink.tagName === 'ExtRef') {
            const where = newIedIdentity(newToIed, mapping.ExtRef);
            if (isSubscribed(newSink)) {
              plan.errors.push(
                `Already subscribed to ${newSink.getAttribute('iedName')}, not changed: ${where}`
              );
              item.failed = true;
              return;
            }
            if (
              !doesFcdaMeetExtRefRestrictions(newSink, newSource, {
                controlBlockType:
                  newCb.tagName === 'GSEControl' ? 'GOOSE' : 'SMV',
                checkOnlyBType: true
              })
            ) {
              plan.errors.push(`The input does not accept this data: ${where}`);
              item.failed = true;
              return;
            }
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
                srcPrefix: srcPrefix || null,
                srcLNClass: logicalNode?.getAttribute('lnClass'),
                srcLNInst: srcLNInst || null
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

        allConnections.push(...connections);
        if (selSupervision) {
          plan.edits.push(selSupervision);
        }

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
            `Could not instantiate supervision ${newSupervisionId}: ${newToIed} may have no free ${cb.type === 'GSEControl' ? 'LGOS' : 'LSVS'} instance`
          );
          return;
        }

        item.supervision = 'new';
        plan.supervisions += 1;
        plan.edits.push(supervision);
      });
    }
  );

  plan.edits.push(
    ...subscribe(allConnections, {
      force: true,
      ignoreSupervision: true,
      checkOnlyBType: true
    })
  );

  return plan;
}
