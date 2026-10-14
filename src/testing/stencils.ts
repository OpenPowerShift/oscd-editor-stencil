import type {
  Application,
  StencilData,
  VersionedApplications
} from '../foundation/types.js';

/** An application version with one function and no control blocks. */
export function makeVersion(version: string, deprecated = false): Application {
  return {
    version,
    description: `version ${version}`,
    deprecated,
    IEDS: {
      Fn: {
        originalName: 'IED1',
        type: 'T',
        manufacturer: 'M',
        privates: [
          { 'OpenSCD-Stencil-Id': 'ID', 'OpenSCD-Stencil-Version': '1.0.0' }
        ]
      }
    },
    ControlBlocks: []
  };
}

export function makeApplication(
  category: string,
  name: string,
  versions: Application[]
): VersionedApplications {
  return { category, name, description: `${name} description`, versions };
}

export function makeStencil(
  applications: VersionedApplications[] = []
): StencilData {
  return { name: 'My Stencil', version: '1.0.0', applications };
}
