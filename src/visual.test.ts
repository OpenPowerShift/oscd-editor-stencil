import { fixture, html } from '@open-wc/testing';
import { setViewport } from '@web/test-runner-commands';
import { visualDiff } from '@web/test-runner-visual-regression';
import type { OscdSelectionList } from '@omicronenergy/oscd-ui/selection-list/OscdSelectionList.js';

import { OscdStencilApply } from './apply/apply-view.js';
import { OscdStencilCapture } from './capture/capture-wizard.js';
import { OscdStencilManage } from './manage/manage-view.js';
import { buildDocument, buildVersion } from './testing/apply-fixture.js';
import { makeApplication, makeStencil } from './testing/stencils.js';

customElements.define('oscd-stencil-apply', OscdStencilApply);
customElements.define('oscd-stencil-capture', OscdStencilCapture);
customElements.define('oscd-stencil-manage', OscdStencilManage);

mocha.timeout(10000);

/** Lets fonts load and icons render before the picture is taken. */
async function settle(): Promise<void> {
  await document.fonts.ready;
  await new Promise(resolve => setTimeout(resolve, 600));
}

const shoot = async (element: Element, name: string): Promise<void> => {
  await settle();
  await visualDiff(element, `oscd-editor-stencil/${name}`);
};

describe('screenshots', () => {
  const doc = buildDocument();
  const version = buildVersion(doc);
  const application = makeApplication('Bus Protection', 'Publisher to Subscriber', [
    version
  ]);
  const stencil = { ...makeStencil([application]), name: 'Demo Stencil' };

  beforeEach(() => setViewport({ width: 1200, height: 900 }));

  describe('apply', () => {
    let el: OscdStencilApply;

    const click = async (selector: string) => {
      (el.shadowRoot!.querySelector(selector) as HTMLElement).click();
      await el.updateComplete;
    };

    const choose = async () => {
      const list = el.shadowRoot!.querySelector('#applications') as OscdSelectionList;
      (list.shadowRoot!.querySelector('oscd-list-item') as HTMLElement).click();
      await el.updateComplete;
    };

    beforeEach(async () => {
      el = await fixture(
        html`<oscd-stencil-apply .doc=${doc} .stencil=${stencil}></oscd-stencil-apply>`
      );
    });

    it('starts by choosing an application', async () => {
      await shoot(el, 'apply 1 choose');
    });

    it('shows what the application needs and its mappings', async () => {
      await choose();
      await shoot(el, 'apply 2 chosen');
    });

    it('assigns an IED to each function', async () => {
      await choose();
      await click('#next');
      await click('#auto');
      await shoot(el, 'apply 3 assign');
    });
  });

  describe('manage', () => {
    it('shows a version of an application', async () => {
      const el = await fixture<OscdStencilManage>(
        html`<oscd-stencil-manage
          .stencil=${stencil}
          .library=${[{ id: 'a', stencil, lastUsed: 1 }]}
          currentId="a"
        ></oscd-stencil-manage>`
      );
      el.selection = {
        category: 'Bus Protection',
        name: 'Publisher to Subscriber',
        version: version.version
      };
      await el.updateComplete;
      await shoot(el, 'manage 1 version');
    });
  });

  describe('capture', () => {
    it('chooses control blocks', async () => {
      const el = await fixture<OscdStencilCapture>(
        html`<oscd-stencil-capture .doc=${doc} .stencil=${makeStencil()}></oscd-stencil-capture>`
      );
      const list = el.shadowRoot!.querySelector('#ieds') as OscdSelectionList;
      list.items.forEach((item) => {
        item.selected = ['PUB1', 'SUB1', 'SELR'].includes(
          item.attachedElement!.getAttribute('name')!
        );
      });
      list.dispatchEvent(new CustomEvent('selection-list-change'));
      await el.updateComplete;
      await shoot(el, 'capture 1 ieds');

      (el.shadowRoot!.querySelector('#next') as HTMLElement).click();
      await el.updateComplete;
      await shoot(el, 'capture 2 control blocks');
    });
  });
});
