import type {
  Application,
  IedRequirement,
  StencilData,
  VersionedApplications
} from './types.js';
import type { ControlBlockInfo } from './mapping-info.js';

/** The newest stencil file format this plugin reads and the one it writes. */
export const SCHEMA_VERSION = 2;

export type ParseResult =
  | { stencil: StencilData; errors?: undefined }
  | { stencil?: undefined; errors: string[] };

const MAX_ERRORS = 10;

type Check = (path: string, value: unknown) => string | undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (path: string, value: unknown): string | undefined =>
  typeof value === 'string' ? undefined : `${path} must be text`;

/** Collects the problems found while reading a stencil. */
class Problems {
  readonly list: string[] = [];

  add(message: string | undefined): boolean {
    if (message && this.list.length < MAX_ERRORS) {
      this.list.push(message);
    }
    return message === undefined;
  }

  get any(): boolean {
    return this.list.length > 0;
  }
}

function readList(
  problems: Problems,
  path: string,
  value: unknown
): unknown[] | undefined {
  if (Array.isArray(value)) {
    return value;
  }
  problems.add(`${path} must be a list`);
  return undefined;
}

function readRecord(
  problems: Problems,
  path: string,
  value: unknown
): Record<string, unknown> | undefined {
  if (isRecord(value)) {
    return value;
  }
  problems.add(`${path} must be an object`);
  return undefined;
}

function requireText(
  problems: Problems,
  path: string,
  value: unknown,
  check: Check = text
): string {
  problems.add(check(path, value));
  return typeof value === 'string' ? value : '';
}

function readControlBlock(
  problems: Problems,
  path: string,
  value: unknown
): ControlBlockInfo | undefined {
  const cb = readRecord(problems, path, value);
  if (!cb) {
    return undefined;
  }

  const mappings = (readList(problems, `${path}.mappings`, cb.mappings) ?? []).map(
    (mapping, i) => {
      const record = readRecord(problems, `${path}.mappings[${i}]`, mapping) ?? {};
      return {
        FCDA: requireText(problems, `${path}.mappings[${i}].FCDA`, record.FCDA),
        ExtRef: requireText(problems, `${path}.mappings[${i}].ExtRef`, record.ExtRef)
      };
    }
  );

  const sel = cb.selSupervision;
  const selSupervision = isRecord(sel)
    ? {
      name: requireText(problems, `${path}.selSupervision.name`, sel.name),
      ExtRef: requireText(problems, `${path}.selSupervision.ExtRef`, sel.ExtRef)
    }
    : undefined;

  return {
    id: requireText(problems, `${path}.id`, cb.id),
    name: requireText(problems, `${path}.name`, cb.name),
    from: requireText(problems, `${path}.from`, cb.from),
    to: requireText(problems, `${path}.to`, cb.to),
    type: requireText(problems, `${path}.type`, cb.type),
    mappings,
    supervision: requireText(problems, `${path}.supervision`, cb.supervision),
    ...(selSupervision && { selSupervision })
  };
}

function readIed(
  problems: Problems,
  path: string,
  value: unknown
): IedRequirement | undefined {
  const ied = readRecord(problems, path, value);
  if (!ied) {
    return undefined;
  }

  const privates = Array.isArray(ied.privates) ? ied.privates : [];
  return {
    originalName: requireText(problems, `${path}.originalName`, ied.originalName),
    type: requireText(problems, `${path}.type`, ied.type),
    manufacturer: requireText(problems, `${path}.manufacturer`, ied.manufacturer),
    ...(typeof ied.comment === 'string' && { comment: ied.comment }),
    privates: privates.map((priv, i) => {
      const record = readRecord(problems, `${path}.privates[${i}]`, priv) ?? {};
      return {
        'OpenSCD-Stencil-Id': requireText(
          problems,
          `${path}.privates[${i}].OpenSCD-Stencil-Id`,
          record['OpenSCD-Stencil-Id']
        ),
        'OpenSCD-Stencil-Version': requireText(
          problems,
          `${path}.privates[${i}].OpenSCD-Stencil-Version`,
          record['OpenSCD-Stencil-Version']
        )
      };
    })
  };
}

function readVersion(
  problems: Problems,
  path: string,
  value: unknown
): Application | undefined {
  const version = readRecord(problems, path, value);
  if (!version) {
    return undefined;
  }

  const ieds = readRecord(problems, `${path}.IEDS`, version.IEDS) ?? {};
  const controlBlocks = readList(problems, `${path}.ControlBlocks`, version.ControlBlocks) ?? [];

  return {
    version: requireText(problems, `${path}.version`, version.version),
    description: typeof version.description === 'string' ? version.description : '',
    deprecated: version.deprecated === true,
    IEDS: Object.fromEntries(
      Object.entries(ieds).flatMap(([name, ied]) => {
        const requirement = readIed(problems, `${path}.IEDS["${name}"]`, ied);
        return requirement ? [[name, requirement]] : [];
      })
    ),
    ControlBlocks: controlBlocks.flatMap((cb, i) => {
      const info = readControlBlock(problems, `${path}.ControlBlocks[${i}]`, cb);
      return info ? [info] : [];
    })
  };
}

function readApplication(
  problems: Problems,
  path: string,
  value: unknown
): VersionedApplications | undefined {
  const app = readRecord(problems, path, value);
  if (!app) {
    return undefined;
  }

  const versions = readList(problems, `${path}.versions`, app.versions) ?? [];
  return {
    category: requireText(problems, `${path}.category`, app.category),
    name: requireText(problems, `${path}.name`, app.name),
    description: typeof app.description === 'string' ? app.description : '',
    versions: versions.flatMap((version, i) => {
      const read = readVersion(problems, `${path}.versions[${i}]`, version);
      return read ? [read] : [];
    })
  };
}

/**
 * Checks a stencil read from a file or storage and brings it to the current
 * schema. Files written before the schema was versioned count as version 1
 * and are read unchanged. Problems are reported with the path to each.
 */
export function validateStencil(value: unknown): ParseResult {
  const problems = new Problems();
  const stencil = readRecord(problems, 'The stencil', value);
  if (!stencil) {
    return { errors: problems.list };
  }

  const schema = stencil.schemaVersion;
  if (schema !== undefined) {
    if (!Number.isInteger(schema) || (schema as number) < 1) {
      return { errors: ['schemaVersion must be a whole number of 1 or more'] };
    }
    if ((schema as number) > SCHEMA_VERSION) {
      return {
        errors: [
          `This stencil uses schema version ${schema as number}, but this plugin only supports versions up to ${SCHEMA_VERSION}. Update the plugin to use it.`
        ]
      };
    }
  }

  const applications = readList(problems, 'applications', stencil.applications) ?? [];
  const result: StencilData = {
    schemaVersion: SCHEMA_VERSION,
    name: requireText(problems, 'name', stencil.name),
    version: requireText(problems, 'version', stencil.version),
    applications: applications.flatMap((app, i) => {
      const read = readApplication(problems, `applications[${i}]`, app);
      return read ? [read] : [];
    })
  };

  return problems.any ? { errors: problems.list } : { stencil: result };
}

/** Reads a stencil from JSON text without throwing. */
export function parseStencil(json: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    return {
      errors: [`The file is not valid JSON: ${(error as Error).message}`]
    };
  }
  return validateStencil(value);
}

/** The JSON text of a stencil, in the current schema. */
export function serializeStencil(stencil: StencilData): string {
  return JSON.stringify({ ...stencil, schemaVersion: SCHEMA_VERSION }, null, 2);
}

/** A file name for a stencil, such as `My_Stencil_1.0.0.json`. */
export function stencilFileName(stencil: StencilData): string {
  const clean = (value: string | undefined, fallback: string): string =>
    (value?.trim() || fallback).replace(/[\s/\\:*?"<>|]+/g, '_');

  return `${clean(stencil.name, 'Unknown Stencil')}_${clean(
    stencil.version,
    'Unknown Version'
  )}.json`;
}
