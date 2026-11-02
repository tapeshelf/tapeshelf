// Runs only on staged files, without a shell (lint-staged spawns commands directly).
// Type-checking and tests run in CI; they are too slow for a hook.
const path = require('node:path');

const bin = (app, name) => path.join(__dirname, app, 'node_modules', '.bin', name);
// Paths quoted: a file or folder name with spaces stays one argument.
const quoted = (files) => files.map((f) => JSON.stringify(f)).join(' ');

module.exports = {
  'backend/**/*.ts': (files) => [
    `${bin('backend', 'prettier')} --write ${quoted(files)}`,
    `${bin('backend', 'oxlint')} -c backend/.oxlintrc.json ${quoted(files)}`,
  ],
  'frontend/**/*.{ts,html}': (files) => [
    `${bin('frontend', 'prettier')} --write ${quoted(files)}`,
    `${bin('frontend', 'eslint')} -c frontend/eslint.config.js ${quoted(files)}`,
  ],
  'frontend/**/*.{css,scss}': (files) => [`${bin('frontend', 'prettier')} --write ${quoted(files)}`],
  '*.{md,yml,yaml,json}': (files) => [`${bin('.', 'prettier')} --write ${quoted(files)}`],
};
