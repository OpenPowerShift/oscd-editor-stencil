import { fixture, html, waitUntil } from '@open-wc/testing';
import { setViewport } from '@web/test-runner-commands';
import { visualDiff } from '@web/test-runner-visual-regression';
import type { OscdSelectionList } from '@omicronenergy/oscd-ui/selection-list/OscdSelectionList.js';

import { OscdStencilApply } from './apply/apply-view.js';
import { OscdStencilCapture } from './capture/capture-wizard.js';
import { OscdStencilJson } from './json/json-editor.js';
import { OscdStencilManage } from './manage/manage-view.js';
import { buildDocument, buildVersion } from './testing/apply-fixture.js';
import { fixtureXml } from './testing/fixture-scd.js';
import { makeApplication, makeStencil } from './testing/stencils.js';

customElements.define('oscd-stencil-apply', OscdStencilApply);
customElements.define('oscd-stencil-capture', OscdStencilCapture);
customElements.define('oscd-stencil-manage', OscdStencilManage);
customElements.define('oscd-stencil-json', OscdStencilJson);

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

    it('explains when no IED can fill a function', async () => {
      el.doc = new DOMParser().parseFromString(fixtureXml, 'application/xml');
      await el.updateComplete;
      await choose();
      await click('#next');
      await shoot(el, 'apply 4 no candidates');
    });

    it('is empty when the stencil has no applications', async () => {
      el.stencil = makeStencil();
      await el.updateComplete;
      await shoot(el, 'apply 5 empty');
    });

    it('is themed by the distribution palette and the plugin hooks', async () => {
      const themed = await fixture<HTMLDivElement>(html`<div
        style="--oscd-theme-base3:#002b36;--oscd-theme-base2:#073642;--oscd-theme-base1:#586e75;--oscd-theme-base00:#839496;--oscd-theme-base0:#657b83;--oscd-editor-stencil-goose-color:#cb4b16;--oscd-editor-stencil-sv-color:#6c71c4;background:#002b36"
      >
        <oscd-stencil-apply .doc=${doc} .stencil=${stencil}></oscd-stencil-apply>
      </div>`);
      const view = themed.querySelector('oscd-stencil-apply') as OscdStencilApply;
      const list = view.shadowRoot!.querySelector('#applications') as OscdSelectionList;
      (list.shadowRoot!.querySelector('oscd-list-item') as HTMLElement).click();
      await view.updateComplete;
      await shoot(themed, 'apply 6 themed');
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

    it('is empty when the stencil has no applications', async () => {
      const empty = makeStencil();
      const el = await fixture<OscdStencilManage>(
        html`<oscd-stencil-manage
          .stencil=${empty}
          .library=${[{ id: 'a', stencil: empty, lastUsed: 1 }]}
          currentId="a"
        ></oscd-stencil-manage>`
      );
      await shoot(el, 'manage 2 empty');
    });

    it('asks before deleting a version', async () => {
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
      el.confirming = 'version';
      await el.updateComplete;
      await shoot(el, 'manage 3 confirm delete');
    });
  });

  describe('json', () => {
    const edit = async (el: OscdStencilJson, text: string) => {
      el.shadowRoot!
        .querySelector('#editor')!
        .dispatchEvent(new CustomEvent('change', { detail: text }));
      await el.updateComplete;
    };

    it('shows the stencil as highlighted JSON', async () => {
      const el = await fixture<OscdStencilJson>(
        html`<oscd-stencil-json .stencil=${stencil}></oscd-stencil-json>`
      );
      await waitUntil(() => el.editorReady, 'editor loads');
      await new Promise(resolve => setTimeout(resolve, 800));
      await shoot(el, 'json 1 valid');
    });

    it('lists what is wrong with the text', async () => {
      const el = await fixture<OscdStencilJson>(
        html`<oscd-stencil-json .stencil=${stencil}></oscd-stencil-json>`
      );
      await waitUntil(() => el.editorReady, 'editor loads');
      await edit(el, '{"name": 5}');
      await new Promise(resolve => setTimeout(resolve, 800));
      await shoot(el, 'json 2 invalid');
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

      (el.shadowRoot!.querySelector('#next') as HTMLElement).click();
      await el.updateComplete;
      await shoot(el, 'capture 3 names');

      const type = async (id: string, value: string) => {
        const field = el.shadowRoot!.querySelector(`#${id}`) as HTMLInputElement;
        field.value = value;
        field.dispatchEvent(new Event('input'));
        await el.updateComplete;
      };
      await type('category', 'Bus Protection');
      await type('name', 'Captured');
      (el.shadowRoot!.querySelector('#next') as HTMLElement).click();
      await el.updateComplete;
      await shoot(el, 'capture 4 review');
    });
  });
});
