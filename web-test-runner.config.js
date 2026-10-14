import base from '@omicronenergy/oscd-tooling/configs/web-test-runner.config.js';

/**
 * Extends the shared oscd-tooling config:
 * - runs test files in parallel pages to keep the suite fast
 * - enforces coverage thresholds (target 90%, see the note below)
 */
export default {
  ...base,
  concurrency: 4,
  coverageConfig: {
    ...base.coverageConfig,
    exclude: [...base.coverageConfig.exclude, 'dist/testing/**'],
    // TEMPORARY: the legacy component is untested until it is split and
    // rewritten (plan phases 3-7). Restore to 90 in phase 8.
    threshold: { statements: 40, branches: 80, functions: 45, lines: 40 },
  },
};
