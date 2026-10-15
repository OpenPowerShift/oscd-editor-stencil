import type {
  Application,
  IedRequirement,
  StencilData,
  VersionedApplications
} from './types.js';

/** What identifies an application in a stencil. */
export type ApplicationKey = { category: string; name: string };

const sameApplication = (app: ApplicationKey, key: ApplicationKey): boolean =>
  app.category === key.category && app.name === key.name;

/** Orders version strings such as `1.10.0` after `1.9.0`. */
export function compareVersions(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

/**
 * The versions of an application that can be used, newest first. Deprecated
 * versions are only included when they are being shown.
 */
export function selectableVersions(
  app: VersionedApplications,
  showDeprecated: boolean
): Application[] {
  return app.versions
    .filter(version => showDeprecated || !version.deprecated)
    .sort((a, b) => compareVersions(b.version, a.version));
}

/**
 * The version used when an application is chosen: the newest current one,
 * or when only deprecated versions are being shown the newest of those.
 */
export function defaultVersion(
  app: VersionedApplications,
  showDeprecated: boolean
): Application | undefined {
  const versions = selectableVersions(app, showDeprecated);
  return versions.find(version => !version.deprecated) ?? versions[0];
}

/** The applications that have a version which can be used. */
export function visibleApplications(
  stencil: StencilData,
  showDeprecated: boolean
): VersionedApplications[] {
  return stencil.applications.filter(
    app => selectableVersions(app, showDeprecated).length > 0
  );
}

/** Whether the stencil already holds this exact version of an application. */
export function hasApplicationVersion(
  stencil: StencilData,
  key: ApplicationKey,
  version: string
): boolean {
  return stencil.applications.some(
    app =>
      sameApplication(app, key) &&
      app.versions.some(existing => existing.version === version)
  );
}

/**
 * Adds a version to an application, creating the application when it is new.
 * A version that already exists is replaced. The stencil is not changed.
 */
export function upsertApplicationVersion(
  stencil: StencilData,
  info: ApplicationKey & { description: string },
  version: Application
): StencilData {
  const existing = stencil.applications.find(app =>
    sameApplication(app, info)
  );

  if (!existing) {
    return {
      ...stencil,
      applications: [
        ...stencil.applications,
        {
          category: info.category,
          name: info.name,
          description: info.description,
          versions: [version]
        }
      ]
    };
  }

  const replaced = existing.versions.some(v => v.version === version.version);
  return {
    ...stencil,
    applications: stencil.applications.map(app =>
      app === existing
        ? {
          ...app,
          description: info.description || app.description,
          versions: replaced
            ? app.versions.map(v => (v.version === version.version ? version : v))
            : [...app.versions, version]
        }
        : app
    )
  };
}

/**
 * Removes one version of an application, and the application itself when
 * it was the last version. The stencil is not changed.
 */
export function removeApplicationVersion(
  stencil: StencilData,
  key: ApplicationKey,
  version: string
): StencilData {
  return {
    ...stencil,
    applications: stencil.applications.flatMap((app) => {
      if (!sameApplication(app, key)) {
        return [app];
      }

      const versions = app.versions.filter(v => v.version !== version);
      return versions.length > 0 ? [{ ...app, versions }] : [];
    })
  };
}

/** Sets the name and version of the stencil. The stencil is not changed. */
export function renameStencil(
  stencil: StencilData,
  name: string,
  version: string
): StencilData {
  return { ...stencil, name, version };
}

/** A count of what an application version contains. */
export type VersionSummary = {
  functions: number;
  goose: number;
  smv: number;
  subscriptions: number;
  supervisions: number;
};

/** What applying a version will configure, before any IEDs are chosen. */
export function summarizeVersion(version: Application): VersionSummary {
  const blocks = version.ControlBlocks;
  return {
    functions: Object.keys(version.IEDS).length,
    goose: blocks.filter(cb => cb.type === 'GSEControl').length,
    smv: blocks.filter(cb => cb.type === 'SampledValueControl').length,
    subscriptions: blocks.reduce((sum, cb) => sum + cb.mappings.length, 0),
    supervisions: blocks.filter(cb => cb.supervision !== 'None').length
  };
}

/** The text fields of an application that can be edited. */
export type ApplicationInfo = ApplicationKey & { description: string };

/** The fields of an application version that can be edited. */
export type VersionInfo = {
  version: string;
  description: string;
  deprecated: boolean;
};

/** The reason an edit cannot be made, or `null` when it can. */
export type EditProblem = string | null;

/** Why an application cannot be given this category and name, if so. */
export function applicationProblem(
  stencil: StencilData,
  from: ApplicationKey,
  to: ApplicationKey
): EditProblem {
  if (!to.category.trim() || !to.name.trim()) {
    return 'Category and name are needed';
  }
  const target = { category: to.category.trim(), name: to.name.trim() };
  const clash =
    !sameApplication(from, target) &&
    stencil.applications.some(app => sameApplication(app, target));
  return clash ? 'An application with this category and name exists' : null;
}

/** Why a version cannot be given this version string, if so. */
export function versionProblem(
  stencil: StencilData,
  key: ApplicationKey,
  from: string,
  to: string
): EditProblem {
  if (!to.trim()) {
    return 'A version is needed';
  }
  return from !== to.trim() && hasApplicationVersion(stencil, key, to.trim())
    ? 'This version exists'
    : null;
}

/**
 * Changes the category, name and description of an application. When there
 * is a problem the stencil is returned as it was.
 */
export function updateApplication(
  stencil: StencilData,
  key: ApplicationKey,
  info: ApplicationInfo
): StencilData {
  if (applicationProblem(stencil, key, info)) {
    return stencil;
  }
  return {
    ...stencil,
    applications: stencil.applications.map(app =>
      sameApplication(app, key)
        ? {
          ...app,
          category: info.category.trim(),
          name: info.name.trim(),
          description: info.description
        }
        : app
    )
  };
}

/**
 * Changes the version string, description and deprecation of one version.
 * When there is a problem the stencil is returned as it was.
 */
export function updateVersion(
  stencil: StencilData,
  key: ApplicationKey,
  version: string,
  info: VersionInfo
): StencilData {
  if (versionProblem(stencil, key, version, info.version)) {
    return stencil;
  }
  return {
    ...stencil,
    applications: stencil.applications.map(app =>
      sameApplication(app, key)
        ? {
          ...app,
          versions: app.versions.map(v =>
            v.version === version
              ? { ...v, ...info, version: info.version.trim() }
              : v
          )
        }
        : app
    )
  };
}

/** Why a function cannot be given this name, if so. */
export function functionProblem(
  version: Application,
  from: string,
  to: string
): EditProblem {
  if (!to.trim()) {
    return 'A function name is needed';
  }
  return from !== to.trim() && Object.prototype.hasOwnProperty.call(version.IEDS, to.trim())
    ? 'A function with this name exists'
    : null;
}

/**
 * Renames a function of a version, keeping its position and following it in
 * the control blocks. When there is a problem the version is returned as it was.
 */
export function renameFunction(
  version: Application,
  from: string,
  to: string
): Application {
  if (functionProblem(version, from, to) || !(from in version.IEDS)) {
    return version;
  }
  const name = to.trim();
  const rename = (fn: string): string => (fn === from ? name : fn);
  return {
    ...version,
    IEDS: Object.fromEntries(
      Object.entries(version.IEDS).map(([fn, ied]) => [rename(fn), ied])
    ),
    ControlBlocks: version.ControlBlocks.map(cb => ({
      ...cb,
      from: rename(cb.from),
      to: rename(cb.to)
    }))
  };
}

/** Changes what a function requires of its IED. */
export function updateRequirement(
  version: Application,
  fn: string,
  requirement: Pick<IedRequirement, 'manufacturer' | 'type'> & {
    id: string;
    idVersion: string;
  }
): Application {
  const existing = version.IEDS[fn];
  if (!existing) {
    return version;
  }
  return {
    ...version,
    IEDS: {
      ...version.IEDS,
      [fn]: {
        ...existing,
        manufacturer: requirement.manufacturer,
        type: requirement.type,
        // the first tag is the one edited; any others are kept
        privates: [
          ...(requirement.id.trim() === '' && requirement.idVersion.trim() === ''
            ? []
            : [
              {
                'OpenSCD-Stencil-Id': requirement.id,
                'OpenSCD-Stencil-Version': requirement.idVersion
              }
            ]),
          ...existing.privates.slice(1)
        ]
      }
    }
  };
}

/** Replaces a version of an application with an edited one. */
export function replaceVersion(
  stencil: StencilData,
  key: ApplicationKey,
  version: string,
  next: Application
): StencilData {
  return {
    ...stencil,
    applications: stencil.applications.map(app =>
      sameApplication(app, key)
        ? { ...app, versions: app.versions.map(v => (v.version === version ? next : v)) }
        : app
    )
  };
}

/** Removes an application with all its versions. The stencil is not changed. */
export function removeApplication(
  stencil: StencilData,
  key: ApplicationKey
): StencilData {
  return {
    ...stencil,
    applications: stencil.applications.filter(app => !sameApplication(app, key))
  };
}
