import { expect, fixture, html } from '@open-wc/testing';

import OscdEditorStencil from './oscd-editor-stencil.js';
import { getLocale, supportedLocale, useLocale } from './localization.js';
import { templates as de } from './locales/de.js';
import { templates as pt } from './locales/pt.js';
import { describeRequirement } from './foundation/candidates.js';
import { fixtureXml } from './testing/fixture-scd.js';

if (!customElements.get('oscd-editor-stencil')) {
  customElements.define('oscd-editor-stencil', OscdEditorStencil);
}

describe('localization', () => {
  afterEach(() => useLocale('en'));

  it('translates every message into German and Portuguese', () => {
    expect(Object.keys(de).length).to.be.greaterThan(100);
    expect(Object.keys(pt).sort()).to.deep.equal(Object.keys(de).sort());
  });

  it('picks the language of a locale and falls back to English', () => {
    expect(supportedLocale('de')).to.equal('de');
    expect(supportedLocale('pt-BR')).to.equal('pt');
    expect(supportedLocale('DE_AT')).to.equal('de');
    expect(supportedLocale('fr')).to.equal('en');
    expect(supportedLocale(undefined)).to.equal('en');
  });

  it('shows the plugin in the language set on it', async () => {
    const doc = new DOMParser().parseFromString(fixtureXml, 'application/xml');
    const plugin = await fixture<OscdEditorStencil>(
      html`<oscd-editor-stencil .doc=${doc} locale="de"></oscd-editor-stencil>`
    );
    await new Promise(resolve => setTimeout(resolve, 100));
    await plugin.updateComplete;
    expect(getLocale()).to.equal('de');
    expect(plugin.shadowRoot!.textContent).to.contain('Verwalten');
    expect(plugin.shadowRoot!.textContent).to.contain('Erstellen');

    plugin.locale = 'pt';
    await new Promise(resolve => setTimeout(resolve, 100));
    await plugin.updateComplete;
    expect(plugin.shadowRoot!.textContent).to.contain('Gerir');

    plugin.locale = 'en';
    await new Promise(resolve => setTimeout(resolve, 100));
    await plugin.updateComplete;
    expect(plugin.shadowRoot!.textContent).to.contain('Manage');
    plugin.remove();
  });

  it('translates text made by the foundation functions', async () => {
    await useLocale('de');
    expect(
      describeRequirement({
        originalName: 'X',
        manufacturer: 'SIEMENS',
        type: '7SS85',
        privates: [{ 'OpenSCD-Stencil-Id': 'A', 'OpenSCD-Stencil-Version': '1' }]
      })
    ).to.equal('SIEMENS 7SS85, markiert mit A 1');
  });
});
