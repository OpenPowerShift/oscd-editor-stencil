import process from 'node:process';
import base from '@omicronenergy/oscd-tooling/configs/web-test-runner.config.js';

/**
 * Extends the shared oscd-tooling config:
 * - runs test files in parallel pages to keep the suite fast
 * - enforces coverage thresholds for the unit tests (the visual group only
 *   takes screenshots, so it has no coverage to enforce)
 */
const visual = process.argv.includes('visual');

export default {
  ...base,
  concurrency: 4,
  coverageConfig: {
    ...base.coverageConfig,
    exclude: [
      ...base.coverageConfig.exclude,
      'dist/testing/**',
      'dist/locales/**'
    ],
    ...(visual
      ? {}
      : {
        threshold: { statements: 90, branches: 90, functions: 90, lines: 90 }
      })
  }
};
