/**
 * During prebuild, skip foojay-resolver-convention in
 * @react-native/gradle-plugin settings (portal fetch is flaky in CI).
 * android-release.ts re-applies the same patch after Bun reinstalls.
 */
const { withDangerousMod } = require('expo/config-plugins');
const path = require('node:path');
const { patchRnFoojayResolver } = require('../scripts/patch-rn-foojay.js');

function withRnFoojaySkip(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const repoRoot = path.join(cfg.modRequest.projectRoot, '..', '..');
      patchRnFoojayResolver(repoRoot);
      return cfg;
    },
  ]);
}

module.exports = withRnFoojaySkip;
