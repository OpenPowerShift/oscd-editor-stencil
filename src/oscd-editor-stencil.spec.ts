import { expect, fixture, html } from '@open-wc/testing';

import OscdEditorStencil from './oscd-editor-stencil.js';
import { fixtureXml } from './testing/fixture-scd.js';

customElements.define('oscd-editor-stencil', OscdEditorStencil);

describe('oscd-editor-stencil', () => {
  let plugin: OscdEditorStencil;

  beforeEach(async () => {
    localStorage.removeItem('oscd-stencil');
    plugin = await fixture(html`<oscd-editor-stencil></oscd-editor-stencil>`);
  });

  afterEach(() => {
    plugin.remove();
  });

  it('asks for a document when none is loaded', () => {
    expect(plugin.shadowRoot?.textContent).to.contain('Please open a file');
  });

  it('renders the stencil header once a document is loaded', async () => {
    plugin.doc = new DOMParser().parseFromString(fixtureXml, 'application/xml');
    plugin.docVersion = 1;
    await plugin.updateComplete;

    expect(plugin.shadowRoot?.querySelector('#stencilName')).to.exist;
  });

  it('accepts docVersion and does not expose the legacy editCount', () => {
    expect('docVersion' in plugin).to.be.true;
    expect('editCount' in plugin).to.be.false;
  });
});
