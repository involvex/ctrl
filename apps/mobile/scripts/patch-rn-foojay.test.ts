import { describe, expect, test } from 'bun:test';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const {
  FOOJAY_MARKER,
  patchFoojaySettingsContents,
  findRnGradlePluginSettings,
} = require('./patch-rn-foojay.js') as {
  FOOJAY_MARKER: string;
  patchFoojaySettingsContents: (contents: string) => string;
  findRnGradlePluginSettings: (repoRoot: string) => string[];
};

const SAMPLE = `pluginManagement {
  repositories {
    mavenCentral()
    google()
    gradlePluginPortal()
  }
}

plugins { id("org.gradle.toolchains.foojay-resolver-convention").version("1.0.0") }

include(":react-native-gradle-plugin")
`;

describe('patch-rn-foojay', () => {
  test('replaces foojay plugins block with empty plugins and marker', () => {
    const out = patchFoojaySettingsContents(SAMPLE);
    expect(out).toContain(FOOJAY_MARKER);
    expect(out).toContain('plugins {}');
    expect(out).not.toContain('foojay-resolver-convention');
    expect(out).toContain('pluginManagement');
  });

  test('is idempotent when marker already present', () => {
    const once = patchFoojaySettingsContents(SAMPLE);
    const twice = patchFoojaySettingsContents(once);
    expect(twice).toBe(once);
  });

  test('leaves unrelated settings unchanged', () => {
    const other = 'plugins { id("com.android.application") }\n';
    expect(patchFoojaySettingsContents(other)).toBe(other);
  });

  test('finds bun-store gradle-plugin settings in this repo', () => {
    const repoRoot = join(import.meta.dir, '..', '..', '..');
    const files = findRnGradlePluginSettings(repoRoot);
    expect(files.some((f) => f.includes('@react-native+gradle-plugin@'))).toBe(
      true
    );
  });
});
