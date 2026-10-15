import { fixture, html, waitUntil } from '@open-wc/testing';
import { setViewport } from '@web/test-runner-commands';
import { visualDiff } from '@web/test-runner-visual-regression';

import { OscdStencilApply } from './apply/apply-view.js';
import { OscdStencilCapture } from './capture/capture-wizard.js';
import { OscdStencilJson } from './json/json-editor.js';
import { OscdStencilManage } from './manage/manage-view.js';
import { OscdStencilHelp } from './shared/help.js';
import { helpReview } from './shared/help-content.js';
import { buildDocument, buildVersion } from './testing/apply-fixture.js';
import { fixtureXml } from './testing/fixture-scd.js';
import { makeApplication, makeStencil } from './testing/stencils.js';

customElements.define('oscd-stencil-apply', OscdStencilApply);
customElements.define('oscd-stencil-capture', OscdStencilCapture);
customElements.define('oscd-stencil-manage', OscdStencilManage);
customElements.define('oscd-stencil-json', OscdStencilJson);
customElements.define('oscd-stencil-help', OscdStencilHelp);

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
      (el.shadowRoot!.querySelector('#applications .app') as HTMLElement).click();
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
      (view.shadowRoot!.querySelector('#applications .app') as HTMLElement).click();
      await view.updateComplete;
      await shoot(themed, 'apply 6 themed');
    });

    /** Goes to the review with the publisher and subscriber copies assigned. */
    const toReview = async (target: XMLDocument) => {
      el.doc = target;
      await el.updateComplete;
      await choose();
      await click('#next');
      const assign = async (fn: string, ied: string) => {
        const select = el.shadowRoot!.querySelector(
          `[data-function="${fn}"] oscd-outlined-select`
        ) as HTMLElement & { value: string };
        select.value = ied;
        select.dispatchEvent(new Event('change'));
        await el.updateComplete;
      };
      await assign('Publisher', 'PUB2');
      await assign('Subscriber', 'SUB2');
      await click('#next');
    };

    it('reviews what applying will change', async () => {
      await toReview(buildDocument());
      await shoot(el, 'apply 7 review');
    });

    it('shows what was applied', async () => {
      await toReview(buildDocument());
      await click('#apply');
      await shoot(el, 'apply 8 applied');
    });

    it('asks what to do with inputs subscribed to another source', async () => {
      const target = buildDocument();
      const taken = target.querySelector('IED[name="SUB2"] ExtRef[intAddr="I1"]')!;
      [
        ['iedName', 'OTHER'],
        ['ldInst', 'LD0'],
        ['lnClass', 'GGIO'],
        ['lnInst', '1'],
        ['doName', 'Ind9']
      ].forEach(([name, value]) => taken.setAttribute(name, value));
      await toReview(target);
      await click('#apply');
      await settle();
      await visualDiff(document.body, 'oscd-editor-stencil/apply 9 conflicts');
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

  describe('help', () => {
    it('opens a dialog with a longer explanation', async () => {
      const el = await fixture<OscdStencilHelp>(
        html`<oscd-stencil-help heading="Reviewing before applying">${helpReview()}</oscd-stencil-help>`
      );
      el.open = true;
      await el.updateComplete;
      await settle();
      await visualDiff(document.body, 'oscd-editor-stencil/help 1 dialog');
    });
  });

  describe('json', () => {
    /**
     * Ace measures its characters when it starts, which can be before the
     * fonts have loaded: wait for the JSON mode and the fonts, then make it
     * measure and draw again, so the picture is the same every time.
     */
    const settleEditor = async (el: OscdStencilJson) => {
      await waitUntil(() => el.editorReady, 'editor loads');
      const ace = el.shadowRoot!.querySelector('#editor') as HTMLElement & {
        editor?: {
          session: { getMode(): { $id: string } };
          renderer: { updateFontSize(): void; updateFull(force: boolean): void };
          resize(force: boolean): void;
        };
      };
      await waitUntil(
        () => ace.editor?.session.getMode().$id === 'ace/mode/json',
        'JSON mode',
        { timeout: 5000 }
      );
      await document.fonts.ready;
      ace.editor!.renderer.updateFontSize();
      ace.editor!.resize(true);
      ace.editor!.renderer.updateFull(true);
      await new Promise(resolve => setTimeout(resolve, 300));
    };

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
      await settleEditor(el);
      await shoot(el, 'json 1 valid');
    });

    it('lists what is wrong with the text', async () => {
      const el = await fixture<OscdStencilJson>(
        html`<oscd-stencil-json .stencil=${stencil}></oscd-stencil-json>`
      );
      await settleEditor(el);
      await edit(el, '{"name": 5}');
      await settleEditor(el);
      await shoot(el, 'json 2 invalid');
    });
  });

  describe('capture', () => {
    it('chooses control blocks', async () => {
      const el = await fixture<OscdStencilCapture>(
        html`<oscd-stencil-capture .doc=${doc} .stencil=${makeStencil()}></oscd-stencil-capture>`
      );
      // a new list of items, so that the list shows the ticks
      el.items = el.items.map(item => ({
        ...item,
        selected: ['PUB1', 'SUB1', 'SELR'].includes(
          item.attachedElement.getAttribute('name')!
        )
      }));
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
