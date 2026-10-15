import { expect, fixture, html, waitUntil } from '@open-wc/testing';

import { OscdStencilJson } from './json-editor.js';
import { serializeStencil } from '../foundation/stencil-io.js';
import type { StencilData } from '../foundation/types.js';
import { makeApplication, makeStencil, makeVersion } from '../testing/stencils.js';

customElements.define('oscd-stencil-json', OscdStencilJson);

describe('oscd-stencil-json', () => {
  let el: OscdStencilJson;
  let stencil: StencilData;
  let changes: StencilData[];

  const q = <T extends Element>(selector: string) =>
    el.shadowRoot!.querySelector(selector) as T;

  const edit = async (text: string) => {
    q('#editor').dispatchEvent(new CustomEvent('change', { detail: text }));
    await el.updateComplete;
  };

  beforeEach(async () => {
    stencil = makeStencil([makeApplication('Bus', 'BZ', [makeVersion('1.0.0')])]);
    el = await fixture(html`<oscd-stencil-json .stencil=${stencil}></oscd-stencil-json>`);
    changes = [];
    el.addEventListener('stencil-change', e =>
      changes.push((e as CustomEvent<StencilData>).detail)
    );
    await waitUntil(() => el.editorReady, 'the editor loads', { timeout: 5000 });
    await el.updateComplete;
  });

  afterEach(() => el.remove());

  it('loads the editor when opened and shows the stencil as JSON', () => {
    expect(q('#editor')).to.exist;
    expect(el.draft).to.equal(serializeStencil(stencil));
    expect(q('#problems')).to.not.exist;
    expect(q<HTMLButtonElement>('#apply').disabled).to.be.true;
    expect(q<HTMLButtonElement>('#revert').disabled).to.be.true;
  });

  it('highlights the text as JSON, in the editor itself', async () => {
    const ace = q<
      HTMLElement & {
        aceEditorBase?: { mode?: string; editor?: { session: { getMode(): { $id: string } } } };
        updateComplete: Promise<unknown>;
      }
    >('#editor');
    await ace.updateComplete;
    await waitUntil(
      () => ace.aceEditorBase?.editor?.session.getMode().$id === 'ace/mode/json',
      'the session uses the JSON mode',
      { timeout: 3000 }
    );
    expect(ace.aceEditorBase?.mode).to.equal('ace/mode/json');
  });

  it('does not leave the JSON mode in the settings that other editors share', async () => {
    localStorage.setItem('oscd:ace-options', JSON.stringify({ mode: 'ace/mode/json', fontSize: '17' }));
    const another = await fixture<OscdStencilJson>(
      html`<oscd-stencil-json .stencil=${stencil}></oscd-stencil-json>`
    );
    expect(JSON.parse(localStorage.getItem('oscd:ace-options')!).mode).to.equal('ace/mode/xml');
    another.remove();
    expect(JSON.parse(localStorage.getItem('oscd:ace-options')!).mode).to.equal('ace/mode/xml');
    expect(JSON.parse(localStorage.getItem('oscd:ace-options')!).fontSize).to.equal('17');

    localStorage.setItem('oscd:ace-options', JSON.stringify({ mode: 'ace/mode/text' }));
    const text = await fixture<OscdStencilJson>(
      html`<oscd-stencil-json .stencil=${stencil}></oscd-stencil-json>`
    );
    text.remove();
    expect(JSON.parse(localStorage.getItem('oscd:ace-options')!).mode).to.equal('ace/mode/text');
    localStorage.removeItem('oscd:ace-options');
  });

  it('lists what is wrong and cannot apply invalid text', async () => {
    await edit('{ broken');
    expect(q('#problems')).to.exist;
    expect(q<HTMLButtonElement>('#apply').disabled).to.be.true;

    await edit('{"name": 5}');
    expect(q('#problems').textContent).to.contain('name');
    expect(changes).to.be.empty;
  });

  it('applies valid text as a stencil', async () => {
    const next = makeStencil([makeApplication('Bus', 'BZ', [makeVersion('3.0.0')])]);
    await edit(JSON.stringify(next));
    expect(q('#problems')).to.not.exist;
    expect(q<HTMLButtonElement>('#apply').disabled).to.be.false;

    q<HTMLElement>('#apply').click();
    expect(changes).to.have.lengthOf(1);
    expect(changes[0].applications[0].versions[0].version).to.equal('3.0.0');
  });

  it('reverts to the stencil', async () => {
    await edit('{ broken');
    q<HTMLElement>('#revert').click();
    await el.updateComplete;
    expect(el.draft).to.equal(serializeStencil(stencil));
    expect(q('#problems')).to.not.exist;
  });

  it('keeps unsaved edits when the stencil is replaced by another, but follows it when unedited', async () => {
    const other = makeStencil([makeApplication('Line', 'Dist', [makeVersion('1.0.0')])]);
    el.stencil = other;
    await el.updateComplete;
    expect(el.draft).to.equal(serializeStencil(other));

    await edit('{ edited');
    el.stencil = stencil;
    await el.updateComplete;
    expect(el.draft).to.equal('{ edited');
  });

  it('treats a missing change detail as empty text', async () => {
    q('#editor').dispatchEvent(new CustomEvent('change'));
    await el.updateComplete;
    expect(el.draft).to.equal('');
  });

  it('cannot apply when there is nothing valid', () => {
    el.draft = '';
    el.stencil = stencil;
    q<HTMLElement>('#apply').click();
    expect(changes).to.be.empty;
  });

  it('edits one version, and starts again from the text of another scope', async () => {
    const key = { category: 'Bus', name: 'BZ' };
    el.scope = { kind: 'version', key, version: '1.0.0' };
    await el.updateComplete;
    expect(JSON.parse(el.draft).version).to.equal('1.0.0');

    await edit(JSON.stringify({ ...JSON.parse(el.draft), description: 'only this' }));
    q<HTMLElement>('#apply').click();
    expect(changes[0].applications[0].versions[0].description).to.equal('only this');
    expect(changes[0].name).to.equal(stencil.name);

    el.scope = { kind: 'application', key };
    await el.updateComplete;
    expect(JSON.parse(el.draft).name).to.equal('BZ');
  });

  it('explains what is wrong with an edited application', async () => {
    el.scope = { kind: 'application', key: { category: 'Bus', name: 'BZ' } };
    await el.updateComplete;
    await edit('{"category": 1}');
    expect(q('#problems').textContent).to.contain('category');
    expect(q<HTMLButtonElement>('#apply').disabled).to.be.true;
  });

  it('names what it edits', async () => {
    expect(q('h2').textContent).to.contain('Edit stencil My Stencil as JSON');
    el.scope = { kind: 'version', key: { category: 'Bus', name: 'BZ' }, version: '1.0.0' };
    await el.updateComplete;
    expect(q('h2').textContent).to.contain('Edit BZ 1.0.0 as JSON');
    el.scope = { kind: 'application', key: { category: 'Bus', name: 'BZ' } };
    await el.updateComplete;
    expect(q('h2').textContent).to.contain('Edit application BZ as JSON');
  });

  it('shows what was saved as stored, so nothing is left to save', async () => {
    const compact = JSON.stringify(stencil);
    await edit(compact.replace('"BZ"', '"Zone"'));
    expect(el.dirty).to.be.true;
    q<HTMLElement>('#apply').click();
    el.stencil = changes[0];
    await el.updateComplete;
    expect(el.dirty).to.be.false;
    expect(q<HTMLButtonElement>('#apply').disabled).to.be.true;
  });

  it('will not save edits made to a stencil that has changed since', async () => {
    await edit('{ "edited": true }');
    el.stencil = makeStencil([makeApplication('Line', 'Dist', [makeVersion('1.0.0')])]);
    await el.updateComplete;
    expect(q('#conflict')).to.exist;
    expect(q<HTMLButtonElement>('#apply').disabled).to.be.true;
    q<HTMLElement>('#revert').click();
    await el.updateComplete;
    expect(q('#conflict')).to.not.exist;
  });

  it('moves with a version whose number is changed', async () => {
    let moved: unknown;
    el.addEventListener('json-scope-change', e => (moved = (e as CustomEvent).detail));
    const key = { category: 'Bus', name: 'BZ' };
    el.scope = { kind: 'version', key, version: '1.0.0' };
    await el.updateComplete;
    await edit(JSON.stringify({ ...JSON.parse(el.draft), version: '1.1.0' }));
    q<HTMLElement>('#apply').click();
    expect(moved).to.deep.equal({ kind: 'version', key, version: '1.1.0' });
  });
});
