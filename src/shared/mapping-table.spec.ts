import { expect, fixture, html } from '@open-wc/testing';

import { OscdStencilMappingTable } from './mapping-table.js';
import type { CellMarker } from './mapping-table.js';
import type { ControlBlockInfo } from '../foundation/mapping-info.js';
import { cellKey } from '../foundation/mapping-matrix.js';

customElements.define('oscd-stencil-mapping-table', OscdStencilMappingTable);

const blocks: ControlBlockInfo[] = [
  {
    id: '>>LD0>GC1',
    name: 'GC1',
    from: 'Pub',
    to: 'Sub',
    type: 'GSEControl',
    mappings: [
      { FCDA: 'a', ExtRef: 'b' },
      { FCDA: 'c', ExtRef: 'd' }
    ],
    supervision: '>>LD0> LGOS 1',
    selSupervision: { name: 'Q_GC1', ExtRef: 'x' }
  },
  {
    id: '>>LD0>SV1',
    name: 'SV1',
    from: 'Pub',
    to: 'Sub',
    type: 'SampledValueControl',
    mappings: [{ FCDA: 'e', ExtRef: 'f' }],
    supervision: 'None'
  },
  {
    id: '>>LD0>GC9',
    name: 'GC9',
    from: 'Sub',
    to: 'Pub',
    type: 'GSEControl',
    mappings: [{ FCDA: 'g', ExtRef: 'h' }],
    supervision: 'None'
  }
];

describe('oscd-stencil-mapping-table', () => {
  let el: OscdStencilMappingTable;

  const q = <T extends Element>(selector: string) =>
    el.shadowRoot!.querySelector(selector) as T;
  const qa = <T extends Element>(selector: string) =>
    Array.from(el.shadowRoot!.querySelectorAll(selector)) as T[];
  const text = (element: Element) => element.textContent!.replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    el = await fixture(
      html`<oscd-stencil-mapping-table .controlBlocks=${blocks}></oscd-stencil-mapping-table>`
    );
  });

  afterEach(() => el.remove());

  it('says when there is nothing to show', async () => {
    el.controlBlocks = [];
    await el.updateComplete;
    expect(el.shadowRoot!.textContent).to.contain('no control blocks');
    expect(q('table')).to.be.null;
  });

  it('has a column for each subscribing function and a group for each publishing one', () => {
    expect(qa('thead th[scope="col"]').map(text)).to.deep.equal([
      'From \\ To',
      'Pub',
      'Sub'
    ]);
    expect(qa('tr.publisher th').map(text)).to.deep.equal(['Pub', 'Sub']);
    expect(qa('th[scope="row"]').map(text)).to.deep.equal([
      'LD0 › GC1',
      'LD0 › SV1',
      'LD0 › GC9'
    ]);
  });

  it('puts each control block in the column of the function that subscribes', () => {
    const rows = qa('tbody tr:not(.publisher)').map(tr =>
      Array.from(tr.querySelectorAll('td')).map(td => td.classList.contains('mapped'))
    );
    expect(rows).to.deep.equal([
      [false, true],
      [false, true],
      [true, false]
    ]);
  });

  it('shows the service, the number of signals and the supervision of each cell', () => {
    const [gc1, sv1] = qa('td.mapped');
    expect(text(gc1.querySelector('.count')!)).to.equal('2');
    expect(Array.from(gc1.querySelectorAll('.supervision')).map(text)).to.deep.equal([
      'LD0 › LGOS 1'
    ]);
    expect(text(gc1.querySelector('.quality')!)).to.equal('fact_checkQuality Q_GC1');
    expect(sv1.querySelector('.quality')).to.be.null;
    expect(gc1.querySelector('.service')!.classList.contains('goose')).to.be.true;
    expect(gc1.querySelector('oscd-icon')!.getAttribute('aria-label')).to.equal('GOOSE');
    expect(sv1.querySelector('.service')!.classList.contains('smv')).to.be.true;
    expect(sv1.querySelector('oscd-icon')!.getAttribute('aria-label')).to.equal(
      'Sampled values'
    );
    expect(text(sv1.querySelector('.count')!)).to.equal('1');
    expect(text(sv1.querySelector('.supervision')!)).to.equal('None');
  });

  it('can hide the supervisions', async () => {
    q<HTMLElement>('oscd-switch').dispatchEvent(new Event('change'));
    await el.updateComplete;
    expect(qa('.supervision')).to.be.empty;
    expect(text(qa('td.mapped')[0].querySelector('.count')!)).to.equal('2');
  });

  it('shows the IED chosen for a function under its name', async () => {
    el.assignment = new Map([
      ['Pub', 'PUB2'],
      ['Sub', 'SUB2']
    ]);
    await el.updateComplete;

    const named = (th: Element) => [
      Array.from((th.querySelector('.group') ?? th).childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent!.trim())
        .join(''),
      text(th.querySelector('.ied')!)
    ];
    expect(qa('thead th[scope="col"]').slice(1).map(named)).to.deep.equal([
      ['Pub', 'PUB2'],
      ['Sub', 'SUB2']
    ]);
    expect(qa('tr.publisher th').map(named)).to.deep.equal([
      ['Pub', 'PUB2'],
      ['Sub', 'SUB2']
    ]);
  });

  it('shows no IED when none is chosen', () => {
    expect(qa('.ied')).to.be.empty;
  });

  it('marks cells with what was done to them', async () => {
    const markers = new Map<string, CellMarker>([
      [cellKey('Pub', 'Sub', 'GC1'), { kind: 'new', label: 'Added' }],
      [cellKey('Sub', 'Pub', 'GC9'), { kind: 'present', label: 'Already present' }],
      [cellKey('Pub', 'Sub', 'SV1'), { kind: 'skipped', label: 'Not applied' }]
    ]);
    el.markers = markers;
    await el.updateComplete;

    expect(qa('.marker').map(text)).to.deep.equal(['Added', 'Not applied', 'Already present']);
    expect(qa('.marker.new')).to.have.lengthOf(1);
    expect(qa('.marker.present')).to.have.lengthOf(1);
    expect(qa('.marker.skipped')).to.have.lengthOf(1);
  });

  it('has an accessible caption', () => {
    expect(text(q('caption'))).to.equal('Control blocks from 2 IEDs to 2 IEDs');
  });

  it('keeps the function names and control block names in view when the table is scrolled across', async () => {
    const scroller = el.shadowRoot!.querySelector('.scroll') as HTMLElement;
    scroller.style.width = '120px';
    scroller.scrollLeft = 150;
    await el.updateComplete;

    const group = el.shadowRoot!.querySelector('tr.publisher .group') as HTMLElement;
    expect(getComputedStyle(group).position).to.equal('sticky');
    const left = scroller.getBoundingClientRect().left;
    expect(group.getBoundingClientRect().left).to.be.closeTo(left + 8, 2);

    const block = el.shadowRoot!.querySelector('th.block') as HTMLElement;
    expect(getComputedStyle(block).position).to.equal('sticky');
    expect(block.getBoundingClientRect().left).to.be.closeTo(left, 2);
  });

  it('shows the SEL message quality as a badge of its own, also when supervisions are hidden', async () => {
    el.shadowRoot!.querySelector<HTMLElement>('oscd-switch')!.dispatchEvent(new Event('change'));
    await el.updateComplete;
    expect(qa('.supervision')).to.be.empty;

    const quality = q<HTMLElement>('.quality');
    expect(quality).to.exist;
    expect(getComputedStyle(quality).borderStyle).to.contain('dashed');
    expect(quality.getAttribute('title')).to.equal('SEL message quality');
  });
});
