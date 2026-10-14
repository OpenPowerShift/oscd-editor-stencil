import { expect, fixture, html } from '@open-wc/testing';

import { OscdStencilHelp } from './help.js';
import {
  helpAssign,
  helpCapture,
  helpCaptureBlocks,
  helpCaptureNames,
  helpJson,
  helpManage,
  helpMappingTable,
  helpReview,
  helpTags,
  helpWhatIsAStencil
} from './help-content.js';

customElements.define('oscd-stencil-help', OscdStencilHelp);

describe('oscd-stencil-help', () => {
  let el: OscdStencilHelp;
  const q = <T extends Element>(selector: string) =>
    el.shadowRoot!.querySelector(selector) as T;

  beforeEach(async () => {
    el = await fixture(
      html`<oscd-stencil-help heading="About this"><p id="text">Long text</p></oscd-stencil-help>`
    );
  });

  it('is a button that is named after what it explains', () => {
    expect(q('#open').getAttribute('aria-label')).to.equal('Help: About this');
    expect(q('#dialog').hasAttribute('open')).to.be.false;
  });

  it('opens a dialog with the title and the text it was given, and closes it', async () => {
    q<HTMLElement>('#open').click();
    await el.updateComplete;
    expect(q('#dialog').hasAttribute('open')).to.be.true;
    expect(q('[slot="headline"]').textContent).to.equal('About this');
    expect(el.querySelector('#text')).to.exist;
    expect(q<HTMLSlotElement>('slot').assignedElements()[0]).to.equal(el.querySelector('#text'));

    q<HTMLElement>('#close').click();
    await el.updateComplete;
    expect(q('#dialog').hasAttribute('open')).to.be.false;
  });

  it('follows the dialog when it closes itself, but not other closing events', async () => {
    el.open = true;
    await el.updateComplete;
    q('#dialog').dispatchEvent(new Event('closed'));
    await el.updateComplete;
    expect(el.open).to.be.false;

    el.open = true;
    await el.updateComplete;
    const inner = document.createElement('div');
    q('#dialog').appendChild(inner);
    inner.dispatchEvent(new Event('closed', { bubbles: true }));
    await el.updateComplete;
    expect(el.open).to.be.true;
  });
});

describe('help content', () => {
  it('is written for every key place', async () => {
    const all = [
      helpWhatIsAStencil,
      helpMappingTable,
      helpAssign,
      helpReview,
      helpManage,
      helpCapture,
      helpCaptureBlocks,
      helpCaptureNames,
      helpTags,
      helpJson
    ];
    for (const content of all) {
      const holder = await fixture<HTMLDivElement>(html`<div>${content()}</div>`);
      expect(holder.textContent!.trim().length, content.name).to.be.greaterThan(80);
    }
  });
});
