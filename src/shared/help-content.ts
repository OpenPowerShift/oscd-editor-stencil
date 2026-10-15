import { html } from 'lit';
import type { TemplateResult } from 'lit';
import { msg } from '@lit/localize';

/**
 * The long explanations behind the help icons. Each one is a function so
 * that it is translated when it is shown.
 */

export const helpWhatIsAStencil = (): TemplateResult => html`
  <p style="margin: 0 0 12px">
    ${msg('A stencil is a reusable, tested piece of communication configuration, for example a bus zone relay and the merging units that send it sampled values. Instead of subscribing every signal by hand in every project, you apply the stencil to the IEDs of your document.')}
  </p>
  <ul style="margin: 0 0 12px; padding-left: 20px">
    <li>${msg('An application is one such group of IEDs, with a category and a name.')}</li>
    <li>${msg('A version is a numbered release of an application. The newest version that is not deprecated is used unless you pick another.')}</li>
    <li>${msg('A function is a role in the application, such as Publisher. It says what kind of IED can fill it: manufacturer, type and optionally a stencil tag.')}</li>
  </ul>
  <p style="margin: 0 0 12px">${msg('Applying changes your document in one step that you can undo. Stencils are kept in this browser, and you can import and export them as files.')}</p>
`;

export const helpMappingTable = (): TemplateResult => html`
  <p style="margin: 0 0 12px">
    ${msg('Each row is a control block that a function publishes. Each column is a function that subscribes to it.')}
  </p>
  <ul style="margin: 0 0 12px; padding-left: 20px">
    <li>${msg('The round G and S icons tell GOOSE and sampled values apart. The number is how many signals the subscriber receives.')}</li>
    <li>${msg('The grey line is the supervision, the logical node (LGOS or LSVS) that watches the subscription.')}</li>
    <li>${msg('The dashed Quality badge is the extra message quality input that SEL relays use. It is shown even when supervisions are hidden.')}</li>
  </ul>
`;

export const helpAssign = (): TemplateResult => html`
  <p style="margin: 0 0 12px">
    ${msg('Each function lists only the IEDs that can fill it: the same manufacturer and type, carrying the stencil tag the function asks for, and not already used by another function.')}
  </p>
  <p style="margin: 0 0 12px">
    ${msg('If a function has no choice it says why, for example that IEDs of the right type exist but none has the tag. Tag the IEDs first with Tag IEDs in Manage, or choose another stencil version.')}
  </p>
  <p style="margin: 0 0 12px">
    ${msg('Assign automatically fills every function that has exactly one possible IED, and repeats while that makes more possible. It never overrides your choices and never guesses between several IEDs: those are left for you.')}
  </p>
  <p style="margin: 0 0 12px">
    ${msg('You can apply part of a stencil: functions without an IED are skipped, and so are the control blocks that need them. At least two IEDs are needed.')}
  </p>
`;

export const helpReview = (): TemplateResult => html`
  <p style="margin: 0 0 12px">
    ${msg('This is a dry run. Nothing in your document has changed yet. For each control block you see what applying will add, and what is already there.')}
  </p>
  <ul style="margin: 0 0 12px; padding-left: 20px">
    <li>${msg('Subscriptions are the ExtRef elements of the subscriber. Existing ones are filled in; where the stencil has none to fill, a complete reference is created.')}</li>
    <li>${msg('Supervisions are set up on a free LGOS or LSVS instance of the subscriber.')}</li>
    <li>${msg('For SEL relays the message quality input is linked too.')}</li>
  </ul>
  <p style="margin: 0 0 12px">
    ${msg('Anything that cannot be found, for example an IED that has no free supervision instance, is listed and skipped. The IED names of the control blocks are not changed.')}
  </p>
  <p style="margin: 0 0 12px">
    ${msg('An input that is already subscribed to another source is listed too. When you apply, you choose whether to keep it or to replace its subscription with the stencil\'s.')}
  </p>
  <p style="margin: 0 0 12px">
    ${msg('Apply makes one change. Use undo in the menu bar to take it back. Applying the same stencil again changes nothing, because what is present is recognised.')}
  </p>
  <p style="margin: 0 0 12px">
    ${msg('An IED whose ClientServices says noIctBinding is true only accepts the inputs its IED tool prepared, so the plugin does not create new ones on it and says so.')}
  </p>
`;

export const helpManage = (): TemplateResult => html`
  <p style="margin: 0 0 12px">
    ${msg('This is your library of stencils. Every stencil you import is kept in this browser, the most recently used first. Browsers keep their data separately, so export a stencil to share it or to keep a copy.')}
  </p>
  <p style="margin: 0 0 12px">
    ${msg('Select an application or a version in the tree to rename it, describe it, deprecate a version or change what a function needs. Changes are checked and saved as you make them. Editing a stencil never changes a document you have already applied it to.')}
  </p>
  <p style="margin: 0 0 12px">
    ${msg('A deprecated version stays in the stencil but is hidden when applying, unless you ask to see deprecated versions.')}
  </p>
  <p style="margin: 0 0 12px">
    ${msg('To make a new application, use Create beside the list of applications: it captures one from the open document. For changes the forms do not cover, edit the JSON of the stencil, an application or a version.')}
  </p>
`;

export const helpCapture = (): TemplateResult => html`
  <p style="margin: 0 0 12px">
    ${msg('Capturing turns IEDs you have already configured into a stencil. Choose the IEDs that belong together, for example one protection relay and its merging units.')}
  </p>
  <p style="margin: 0 0 12px">
    ${msg('Only control blocks that one of the chosen IEDs sends and another is subscribed to are found. If nothing is found, check that the subscriptions exist in the document.')}
  </p>
  <p style="margin: 0 0 12px">
    ${msg('The next steps let you untick what should not be part of the application, then name it and its functions.')}
  </p>
`;

export const helpCaptureBlocks = (): TemplateResult => html`
  <p style="margin: 0 0 12px">
    ${msg('Each row is a control block of an IED, each column an IED that subscribes to it, and each tick a subscription to keep.')}
  </p>
  <p style="margin: 0 0 12px">
    ${msg('Ticking an IED, a row or a column ticks everything in it, and a box with a dash means only part of it is ticked. Leave out what is specific to your project, such as a link to a device that only exists there.')}
  </p>
`;

export const helpCaptureNames = (): TemplateResult => html`
  <p style="margin: 0 0 12px">
    ${msg('Category and name say what the application is. The version lets you keep older releases: saving the same category, name and version again replaces it, after asking you.')}
  </p>
  <p style="margin: 0 0 12px">
    ${msg('Each IED becomes a function. Choose names that describe the role, such as Publisher or Merging unit 1, not the IED name from this project, because the functions are what you see when applying the stencil to other IEDs.')}
  </p>
`;

export const helpTags = (): TemplateResult => html`
  <p style="margin: 0 0 12px">
    ${msg('A stencil tag is a pair of Private elements on an IED, OpenSCD-Stencil-Id and OpenSCD-Stencil-Version. When a function records a tag, only IEDs with the same tag can fill it.')}
  </p>
  <p style="margin: 0 0 12px">
    ${msg('Tags are useful when IEDs of the same type do different jobs, for example a bus protection relay and a line protection relay of the same model. Without a tag, any IED of the same manufacturer and type matches.')}
  </p>
`;

export const helpJson = (): TemplateResult => html`
  <p style="margin: 0 0 12px">
    ${msg('This is the stencil as it is stored. The text is checked as you type, and only text that passes the checks can be saved. The problems are listed below the editor.')}
  </p>
  <p style="margin: 0 0 12px">
    ${msg('The file has a schema version, currently 2. Files from earlier versions of the plugin have none and are read unchanged. References to elements are written as the identity of the element without the IED name.')}
  </p>
  <p style="margin: 0 0 12px">
    ${msg('Use the forms for everyday changes. Edit the JSON for what they do not cover, such as removing a single subscription.')}
  </p>
`;
