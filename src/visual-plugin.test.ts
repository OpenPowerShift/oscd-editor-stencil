import { fixture, html } from '@open-wc/testing';
import { setViewport } from '@web/test-runner-commands';
import { visualDiff } from '@web/test-runner-visual-regression';

import OscdEditorStencil from './oscd-editor-stencil.js';
import { buildDocument, buildVersion } from './testing/apply-fixture.js';
import { makeApplication, makeStencil } from './testing/stencils.js';

customElements.define('oscd-editor-stencil', OscdEditorStencil);

mocha.timeout(10000);

/** Lets fonts load, icons render and dialogs open before the picture is taken. */
async function settle(): Promise<void> {
  await document.fonts.ready;
  await new Promise(resolve => setTimeout(resolve, 600));
}

describe('screenshots of the plugin', () => {
  beforeEach(() => {
    localStorage.removeItem('oscd-stencil');
    localStorage.removeItem('oscd-stencil-library');
    return setViewport({ width: 1200, height: 900 });
  });

  it('starts by offering to import or make a stencil', async () => {
    const plugin = await fixture<OscdEditorStencil>(
      html`<oscd-editor-stencil .doc=${buildDocument()}></oscd-editor-stencil>`
    );
    await settle();
    await visualDiff(plugin, 'oscd-editor-stencil/plugin 1 first run');
  });

  it('tags IEDs with the tag of a function', async () => {
    const doc = buildDocument();
    const version = buildVersion(doc);
    const plugin = await fixture<OscdEditorStencil>(
      html`<oscd-editor-stencil .doc=${doc}></oscd-editor-stencil>`
    );
    plugin.stencilData = {
      ...makeStencil([makeApplication('Bus Protection', 'Publisher to Subscriber', [version])]),
      name: 'Demo Stencil'
    };
    await plugin.updateComplete;

    plugin.shadowRoot!.querySelector('oscd-stencil-apply')!.dispatchEvent(
      new CustomEvent('stencil-tag', { detail: version, bubbles: true, composed: true })
    );
    await plugin.updateComplete;
    plugin.metadataIedItems = plugin.metadataIedItems.map(item => ({
      ...item,
      selected: ['PUB2'].includes(item.attachedElement!.getAttribute('name')!)
    }));
    await plugin.updateComplete;
    await settle();
    await visualDiff(document.body, 'oscd-editor-stencil/plugin 2 tag ieds');
  });
});
