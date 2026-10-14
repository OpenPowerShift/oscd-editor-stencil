// test helpers are only built for the tests and are not published
// eslint-disable-next-line import-x/no-extraneous-dependencies
import { handleEdit } from '@omicronenergy/oscd-editor';

import { getMappingInfo } from '../foundation/mapping-info.js';
import { tagIedEdits } from '../foundation/ied-tags.js';
import type { Application } from '../foundation/types.js';
import { fixtureXml } from './fixture-scd.js';
import { applicationFrom, cloneAsClean } from './scl.js';

export const requirement = (
  manufacturer: string,
  type: string,
  id?: string
) => ({
  originalName: 'X',
  manufacturer,
  type,
  privates: id
    ? [{ 'OpenSCD-Stencil-Id': id, 'OpenSCD-Stencil-Version': '1.0.0' }]
    : []
});

/** A document with a source pair (PUB1, SUB1), clean copies of them and a SEL relay. */
export function buildDocument(): XMLDocument {
  const doc = new DOMParser().parseFromString(fixtureXml, 'application/xml');
  const tag = (ied: string, id: string) =>
    tagIedEdits(doc.querySelector(`IED[name="${ied}"]`)!, id, '1.0.0').forEach(e =>
      handleEdit(e)
    );
  tag('PUB1', 'BZ-Publisher');
  tag('SUB1', 'BZ-Subscriber');
  cloneAsClean(doc, 'PUB1', 'PUB2');
  cloneAsClean(doc, 'SUB1', 'SUB2');
  return doc;
}

export function buildVersion(doc: XMLDocument): Application {
  const version = applicationFrom(
    getMappingInfo(doc, 'PUB1', 'SUB1'),
    'Publisher',
    'Subscriber'
  );
  version.version = '1.0.0';
  version.description = 'GOOSE and SV';
  version.IEDS = {
    Publisher: requirement('SIEMENS', '7SS85', 'BZ-Publisher'),
    Subscriber: requirement('SIEMENS', '6MU85', 'BZ-Subscriber'),
    Relay: requirement('SEL', 'SEL-421')
  };
  return version;
}
