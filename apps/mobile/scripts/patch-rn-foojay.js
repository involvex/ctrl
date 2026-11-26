/**
 * Skip foojay-resolver-convention in @react-native/gradle-plugin settings.
 * CI already provides JDK 17 via setup-java; the portal fetch is flaky and
 * fails Assemble release APK with "plugin … was not found".
 */
const {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} = require('node:fs');
const { join } = require('node:path');

const FOOJAY_MARKER = 'ctrl-skip-foojay-resolver';

const FOOJAY_PLUGINS =
  /plugins\s*\{\s*id\(\s*"org\.gradle\.toolchains\.foojay-resolver-convention"\s*\)\.version\(\s*"[^"]+"\s*\)\s*\}/;

const REPLACEMENT = `// @generated begin ${FOOJAY_MARKER}
// JDK comes from JAVA_HOME (CI setup-java / local JDK). Skip portal fetch.
plugins {}
// @generated end ${FOOJAY_MARKER}`;

function patchFoojaySettingsContents(contents) {
  if (contents.includes(FOOJAY_MARKER)) {
    return contents;
  }
  if (!FOOJAY_PLUGINS.test(contents)) {
    return contents;
  }
  return contents.replace(FOOJAY_PLUGINS, REPLACEMENT);
}

function findRnGradlePluginSettings(repoRoot) {
  const found = new Set();
  const direct = [
    join(
      repoRoot,
      'node_modules',
      '@react-native',
      'gradle-plugin',
      'settings.gradle.kts'
    ),
    join(
      repoRoot,
      'apps',
      'mobile',
      'node_modules',
      '@react-native',
      'gradle-plugin',
      'settings.gradle.kts'
    ),
  ];
  for (const file of direct) {
    if (existsSync(file)) {
      found.add(file);
    }
  }
  const bunRoot = join(repoRoot, 'node_modules', '.bun');
  if (existsSync(bunRoot)) {
    for (const name of readdirSync(bunRoot)) {
      if (!name.startsWith('@react-native+gradle-plugin@')) {
        continue;
      }
      const file = join(
        bunRoot,
        name,
        'node_modules',
        '@react-native',
        'gradle-plugin',
        'settings.gradle.kts'
      );
      if (existsSync(file)) {
        found.add(file);
      }
    }
  }
  return [...found];
}

/** Patch every discovered settings.gradle.kts; returns how many files changed. */
function patchRnFoojayResolver(repoRoot) {
  let changed = 0;
  for (const file of findRnGradlePluginSettings(repoRoot)) {
    const before = readFileSync(file, 'utf8');
    const after = patchFoojaySettingsContents(before);
    if (after !== before) {
      writeFileSync(file, after, 'utf8');
      changed += 1;
    }
  }
  return changed;
}

module.exports = {
  FOOJAY_MARKER,
  patchFoojaySettingsContents,
  findRnGradlePluginSettings,
  patchRnFoojayResolver,
};
