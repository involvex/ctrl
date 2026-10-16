import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function executableLines(src: string): string {
  return src
    .split('\n')
    .filter((line) => {
      const t = line.trimStart();
      return (
        !t.startsWith('//') &&
        !t.startsWith('*') &&
        !t.startsWith('/**') &&
        !t.startsWith('*/')
      );
    })
    .join('\n');
}

describe('android-release script', () => {
  test('only runs Gradle assembleRelease (no Metro / expo_url)', () => {
    const src = readFileSync(
      join(import.meta.dir, 'android-release.ts'),
      'utf8'
    );
    const body = executableLines(src);
    expect(body).toContain("['assembleRelease']");
    expect(body).not.toContain('expo run');
    expect(body).not.toContain('__expo_url');
    expect(body).not.toContain('8081');
    expect(body).not.toContain('8082');
    expect(body.toLowerCase()).not.toContain('metro');
  });

  test('package scripts wire build and android:release to the script', () => {
    const pkg = JSON.parse(
      readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8')
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts.build).toContain('android-release.ts');
    expect(pkg.scripts['android:release']).toContain('android-release.ts');
    expect(pkg.scripts.check).toBe('bun check');
    expect(pkg.scripts['check:expo']).toContain('expo-doctor');
    expect(pkg.scripts.prebuild).toBeUndefined();
    expect(pkg.scripts['prebuild:android']).toContain('expo prebuild');
  });
});
