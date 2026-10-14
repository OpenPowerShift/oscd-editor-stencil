import { expect } from '@open-wc/testing';
import { handleEdit } from '@omicronenergy/oscd-editor';
import type { EditV2 } from '@openscd/oscd-api';

import {
  STENCIL_ID,
  STENCIL_VERSION,
  readIedTag,
  tagIedEdits
} from './ied-tags.js';
import { fixtureXml } from '../testing/fixture-scd.js';

function apply(edits: EditV2[]): void {
  edits.forEach(edit => handleEdit(edit));
}

describe('ied-tags', () => {
  let ied: Element;

  beforeEach(() => {
    const doc = new DOMParser().parseFromString(fixtureXml, 'application/xml');
    ied = doc.querySelector('IED[name="SUB1"]')!;
  });

  it('reads nothing from an untagged IED', () => {
    expect(readIedTag(ied)).to.be.null;
  });

  it('inserts both tags, namespaced like the document, before other children', () => {
    const edits = tagIedEdits(ied, ' BZ ', ' 1.0.0 ');
    expect(edits).to.have.lengthOf(2);
    apply(edits);

    expect(readIedTag(ied)).to.deep.equal({ id: 'BZ', version: '1.0.0' });
    const privates = ied.querySelectorAll(':scope > Private');
    expect(privates).to.have.lengthOf(2);
    expect(privates[0].namespaceURI).to.equal(ied.namespaceURI);
    expect(privates[0].getAttribute('type')).to.equal(STENCIL_ID);
    expect(privates[1].getAttribute('type')).to.equal(STENCIL_VERSION);
    expect(ied.firstElementChild).to.equal(privates[0]);
  });

  it('updates existing tags instead of adding duplicates', () => {
    apply(tagIedEdits(ied, 'BZ', '1.0.0'));
    const edits = tagIedEdits(ied, 'BZ', '2.0.0');
    expect(edits).to.have.lengthOf(1);
    apply(edits);

    expect(ied.querySelectorAll(':scope > Private')).to.have.lengthOf(2);
    expect(readIedTag(ied)).to.deep.equal({ id: 'BZ', version: '2.0.0' });
  });

  it('makes no edits when the IED already carries the tags', () => {
    apply(tagIedEdits(ied, 'BZ', '1.0.0'));
    expect(tagIedEdits(ied, 'BZ', '1.0.0')).to.be.empty;
  });

  it('undoes cleanly', () => {
    const undo = tagIedEdits(ied, 'BZ', '1.0.0').map(edit => handleEdit(edit));
    undo.reverse().forEach(edit => handleEdit(edit));
    expect(readIedTag(ied)).to.be.null;
  });
});
