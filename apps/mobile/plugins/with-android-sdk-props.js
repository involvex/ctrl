/**
 * Ensures expo-build-properties values land in rootProject.ext even when the
 * expoLibs catalog override is skipped (stale prebuild / missing gradle props).
 * Mirrors the community patch from expo/expo#36461.
 */
const { withProjectBuildGradle } = require('expo/config-plugins');

const PATCH = `
// @generated begin ctrl-android-sdk-props
ext {
  if (!project.ext.has('minSdkVersion')) {
    minSdkVersion = Integer.parseInt(findProperty('android.minSdkVersion') ?: '26')
  }
  if (!project.ext.has('compileSdkVersion')) {
    compileSdkVersion = Integer.parseInt(findProperty('android.compileSdkVersion') ?: '36')
  }
  if (!project.ext.has('targetSdkVersion')) {
    targetSdkVersion = Integer.parseInt(findProperty('android.targetSdkVersion') ?: '36')
  }
}
// @generated end ctrl-android-sdk-props
`;

function withAndroidSdkProps(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes('ctrl-android-sdk-props')) {
      return cfg;
    }
    cfg.modResults.contents = cfg.modResults.contents.replace(
      'apply plugin: "expo-root-project"',
      `${PATCH}\napply plugin: "expo-root-project"`
    );
    return cfg;
  });
}

module.exports = withAndroidSdkProps;
