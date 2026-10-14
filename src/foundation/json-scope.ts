import { serializeStencil, validateStencil } from './stencil-io.js';
import {
  applicationProblem,
  versionProblem
} from './stencil-model.js';
import type { ApplicationKey } from './stencil-model.js';
import type { StencilData } from './types.js';

/** The part of a stencil that is edited as JSON. */
export type JsonScope =
  | { kind: 'stencil' }
  | { kind: 'application'; key: ApplicationKey }
  | { kind: 'version'; key: ApplicationKey; version: string };

export type JsonEdit =
  | { stencil: StencilData; errors?: undefined }
  | { stencil?: undefined; errors: string[] };

const sameApplication = (a: ApplicationKey, b: ApplicationKey): boolean =>
  a.category === b.category && a.name === b.name;

/** The JSON text of the scope, or of the whole stencil when it is not there. */
export function scopeText(stencil: StencilData, scope: JsonScope): string {
  const app =
    scope.kind === 'stencil'
      ? undefined
      : stencil.applications.find(candidate =>
        sameApplication(candidate, scope.key)
      );
  if (scope.kind === 'application' && app) {
    return JSON.stringify(app, null, 2);
  }
  if (scope.kind === 'version' && app) {
    const version = app.versions.find(v => v.version === scope.version);
    if (version) {
      return JSON.stringify(version, null, 2);
    }
  }
  return serializeStencil(stencil);
}

function parse(text: string): { value: unknown } | { errors: string[] } {
  try {
    return { value: JSON.parse(text) };
  } catch (error) {
    return {
      errors: [`The text is not valid JSON: ${(error as Error).message}`]
    };
  }
}

/** Checks the edited text of a scope with the rules of the whole file. */
function validated(
  stencil: StencilData,
  application: unknown
): JsonEdit {
  return validateStencil({
    schemaVersion: stencil.schemaVersion,
    name: stencil.name,
    version: stencil.version,
    applications: [application]
  });
}

/**
 * The stencil with the edited text of a scope in place of the original.
 * The text is checked as it would be in a file, and a category, name or
 * version that another one already has is refused.
 */
export function applyScopeText(
  stencil: StencilData,
  scope: JsonScope,
  text: string
): JsonEdit {
  const read = parse(text);
  if ('errors' in read) {
    return { errors: read.errors };
  }

  if (scope.kind === 'stencil') {
    return validateStencil(read.value);
  }

  const original = stencil.applications.find(app =>
    sameApplication(app, scope.key)
  );
  if (!original) {
    return { errors: ['This application is no longer in the stencil'] };
  }

  if (scope.kind === 'application') {
    const checked = validated(stencil, read.value);
    if (!checked.stencil) {
      return checked;
    }
    const [edited] = checked.stencil.applications;
    const problem = applicationProblem(stencil, scope.key, edited);
    return problem
      ? { errors: [problem] }
      : {
        stencil: {
          ...stencil,
          applications: stencil.applications.map(app =>
            app === original ? edited : app
          )
        }
      };
  }

  const checked = validated(stencil, { ...original, versions: [read.value] });
  if (!checked.stencil) {
    return {
      errors: checked.errors.map(error =>
        error.replace(/^applications\[0\]\.versions\[0\]\.?/, '')
      )
    };
  }
  const [edited] = checked.stencil.applications[0].versions;
  const problem = versionProblem(stencil, scope.key, scope.version, edited.version);
  return problem
    ? { errors: [problem] }
    : {
      stencil: {
        ...stencil,
        applications: stencil.applications.map(app =>
          app === original
            ? {
              ...app,
              versions: app.versions.map(v =>
                v.version === scope.version ? edited : v
              )
            }
            : app
        )
      }
    };
}
