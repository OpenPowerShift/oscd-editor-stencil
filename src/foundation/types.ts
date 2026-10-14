import type { ControlBlockInfo } from './mapping-info.js';

/** The IED requirements of one function in an application version. */
export type IedRequirement = {
  originalName: string;
  type: string;
  manufacturer: string;
  comment?: string;
  privates: {
    'OpenSCD-Stencil-Id': string;
    'OpenSCD-Stencil-Version': string;
  }[];
};

/** One version of an application. */
export type Application = {
  version: string;
  description: string;
  deprecated: boolean;
  IEDS: Record<string, IedRequirement>;
  ControlBlocks: ControlBlockInfo[];
};

export type VersionedApplications = {
  category: string;
  name: string;
  description: string;
  versions: Application[];
};

export type StencilData = {
  /** Absent in files written before schema versioning (treated as 1). */
  schemaVersion?: number;
  name: string;
  version: string;
  applications: VersionedApplications[];
};
