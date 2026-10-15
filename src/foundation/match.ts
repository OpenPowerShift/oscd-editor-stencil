import { matchDataAttributes } from '@openscd/scl-lib';

const serviceTypes: Partial<Record<string, string>> = {
  GSEControl: 'GOOSE',
  SampledValueControl: 'SMV',
  ReportControl: 'Report'
};

/** The IED directly under the SCL root with the given name. */
export function findIed(doc: XMLDocument, name: string): Element | undefined {
  const known = iedsByName.get(doc);
  const cached = known?.get(name);
  if (cached?.isConnected && cached.getAttribute('name') === name) {
    return cached;
  }

  // the cache is rebuilt when an IED is missing, renamed or removed
  const rebuilt = new Map<string, Element>();
  doc.querySelectorAll(':root > IED').forEach((ied) => {
    const iedName = ied.getAttribute('name');
    if (iedName !== null && !rebuilt.has(iedName)) {
      rebuilt.set(iedName, ied);
    }
  });
  iedsByName.set(doc, rebuilt);
  return rebuilt.get(name);
}

const iedsByName = new WeakMap<XMLDocument, Map<string, Element>>();

/** Every ExtRef in the inputs of an IED's logical nodes. */
export function inputsOf(ied: Element): Element[] {
  return Array.from(
    ied.querySelectorAll(
      ':scope > AccessPoint > Server > LDevice > :is(LN0, LN) > Inputs > ExtRef'
    )
  );
}

/** Whether an ExtRef is already subscribed to an FCDA. */
export function isSubscribed(extRef: Element): boolean {
  return (
    extRef.hasAttribute('iedName') &&
    extRef.hasAttribute('ldInst') &&
    extRef.hasAttribute('lnClass') &&
    // LLN0 has no instance, so an ExtRef to its data needs no lnInst
    (extRef.hasAttribute('lnInst') ||
      extRef.getAttribute('lnClass') === 'LLN0') &&
    extRef.hasAttribute('doName')
  );
}

/**
 * Whether the source attributes of an ExtRef point at a control block.
 *
 * This is scl-lib's `matchSrcAttributes` except that `serviceType` may be
 * absent, as on SEL message-quality ExtRefs. Every other attribute is still
 * checked, so an ExtRef without a service type does not match every control
 * block of its publisher.
 */
export function matchSrcAttributes(extRef: Element, control: Element): boolean {
  const serviceType = extRef.getAttribute('serviceType');
  if (serviceType && serviceType !== serviceTypes[control.tagName]) {
    return false;
  }

  const logicalNode = control.closest('LN0, LN');
  const srcLDInst = control.closest('LDevice')?.getAttribute('inst');
  const srcLNClass = logicalNode?.getAttribute('lnClass');

  const extRefSrcLNClass = extRef.getAttribute('srcLNClass');
  const srcLnClassCheck = extRefSrcLNClass
    ? extRefSrcLNClass === srcLNClass
    : srcLNClass === 'LLN0';

  const extRefSrcLDInst = extRef.getAttribute('srcLDInst');
  const srcLdInstCheck = extRefSrcLDInst
    ? extRefSrcLDInst === srcLDInst
    : extRef.getAttribute('ldInst') === srcLDInst;

  return (
    extRef.getAttribute('srcCBName') === control.getAttribute('name') &&
    srcLdInstCheck &&
    (extRef.getAttribute('srcPrefix') ?? '') ===
      (logicalNode?.getAttribute('prefix') ?? '') &&
    (extRef.getAttribute('srcLNInst') ?? '') ===
      logicalNode?.getAttribute('inst') &&
    srcLnClassCheck
  );
}

/** The FCDA in the control block's data set an ExtRef is subscribed to. */
export function findFcda(control: Element, extRef: Element): Element | undefined {
  const dataSetName = control.getAttribute('datSet');
  const dataSet = Array.from(
    control.closest('LN0, LN')?.querySelectorAll(':scope > DataSet') ?? []
  ).find(candidate => candidate.getAttribute('name') === dataSetName);

  return Array.from(dataSet?.querySelectorAll(':scope > FCDA') ?? []).find(
    fcda => matchDataAttributes(extRef, fcda)
  );
}

/**
 * Whether a subscribed ExtRef belongs to a control block.
 *
 * An ExtRef with source attributes must match them. Without `srcCBName`, as
 * in Edition 1 files, the control block cannot be checked, so the ExtRef
 * belongs to the control block whose data set holds the data it points at.
 */
export function isSubscribedTo(extRef: Element, control: Element): boolean {
  if (extRef.hasAttribute('srcCBName')) {
    return matchSrcAttributes(extRef, control);
  }

  const serviceType = extRef.getAttribute('serviceType');
  if (serviceType && serviceType !== serviceTypes[control.tagName]) {
    return false;
  }
  return findFcda(control, extRef) !== undefined;
}
