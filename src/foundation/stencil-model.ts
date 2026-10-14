import type {
  Application,
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
