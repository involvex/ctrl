/**
 * Standalone release APK: Gradle assembleRelease embeds the JS bundle.
 * Does not start Metro or open exp+…?__expo_url=… (ports 8081/8082).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const androidDir = join(import.meta.dir, '..', 'android');
if (!existsSync(androidDir)) {
  process.stderr.write(
    'Missing apps/mobile/android. Run: bun run --filter @involvex/ctrl-mobile prebuild:android\n'
  );
  process.exit(1);
}

const isWin = process.platform === 'win32';
const gradle = isWin ? 'gradlew.bat' : './gradlew';
const result = spawnSync(gradle, ['assembleRelease'], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: isWin,
});

process.exit(result.status === null ? 1 : result.status);
