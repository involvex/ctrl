/**
 * Ensures expo-build-properties values land in rootProject.ext, and forces
 * every Android library/app module (incl. react-native-litert-lm, which pins
 * compileSdk 36) onto the project compileSdk from gradle.properties.
 */
const { withProjectBuildGradle, withDangerousMod } =
  require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const EXT_PATCH = `
// @generated begin ctrl-android-sdk-props
ext {
  if (!project.ext.has('minSdkVersion')) {
    minSdkVersion = Integer.parseInt(findProperty('android.minSdkVersion') ?: '26')
  }
  if (!project.ext.has('compileSdkVersion')) {
    compileSdkVersion = Integer.parseInt(findProperty('android.compileSdkVersion') ?: '37')
  }
  if (!project.ext.has('targetSdkVersion')) {
    targetSdkVersion = Integer.parseInt(findProperty('android.targetSdkVersion') ?: '37')
  }
}
// @generated end ctrl-android-sdk-props
`;

const FORCE_SDK_PATCH = `
// @generated begin ctrl-force-compile-sdk
subprojects { sub ->
  sub.afterEvaluate {
    def androidExt = sub.extensions.findByName("android")
    if (androidExt == null) {
      return
    }
    def compile = rootProject.ext.has("compileSdkVersion")
      ? rootProject.ext.compileSdkVersion
      : Integer.parseInt(findProperty("android.compileSdkVersion") ?: "37")
    try {
      androidExt.compileSdk = compile instanceof Integer ? compile : Integer.parseInt("\${compile}")
    } catch (Throwable ignored) {
      // Some AGP versions expose compileSdkVersion differently; best-effort.
    }
  }
}
// @generated end ctrl-force-compile-sdk
`;

function ensurePatch(contents, beginMarker, patch, anchor) {
  if (contents.includes(beginMarker)) {
    return contents;
  }
  if (contents.includes(anchor)) {
    return contents.replace(anchor, `${patch}\n${anchor}`);
  }
  return `${contents.trimEnd()}\n${patch}\n`;
}

function findLitertAndroidBuildGradle(projectRoot) {
  const candidates = [
    path.join(
      projectRoot,
      'node_modules',
      'react-native-litert-lm',
      'android',
      'build.gradle'
    ),
    path.join(
      projectRoot,
      '..',
      '..',
      'node_modules',
      'react-native-litert-lm',
      'android',
      'build.gradle'
    ),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return file;
    }
  }
  const bunRoot = path.join(projectRoot, '..', '..', 'node_modules', '.bun');
  if (!fs.existsSync(bunRoot)) {
    return null;
  }
  for (const name of fs.readdirSync(bunRoot)) {
    if (!name.startsWith('react-native-litert-lm@')) {
      continue;
    }
    const file = path.join(
      bunRoot,
      name,
      'node_modules',
      'react-native-litert-lm',
      'android',
      'build.gradle'
    );
    if (fs.existsSync(file)) {
      return file;
    }
  }
  return null;
}

function withAndroidSdkProps(config) {
  config = withProjectBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;
    contents = ensurePatch(
      contents,
      'ctrl-android-sdk-props',
      EXT_PATCH,
      'apply plugin: "expo-root-project"'
    );
    contents = ensurePatch(
      contents,
      'ctrl-force-compile-sdk',
      FORCE_SDK_PATCH,
      'apply plugin: "expo-root-project"'
    );
    cfg.modResults.contents = contents;
    return cfg;
  });

  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const gradleFile = findLitertAndroidBuildGradle(
        cfg.modRequest.projectRoot
      );
      if (gradleFile) {
        let text = fs.readFileSync(gradleFile, 'utf8');
        if (text.includes('compileSdk 36')) {
          text = text.replace(
            /compileSdk\s+36/,
            'compileSdk rootProject.ext.has("compileSdkVersion") ? rootProject.ext.compileSdkVersion : 37'
          );
          fs.writeFileSync(gradleFile, text, 'utf8');
        }
      }
      return cfg;
    },
  ]);

  return config;
}

module.exports = withAndroidSdkProps;
