import { describe, expect, it } from 'vitest';
import {
  compareSemver,
  parseSemver,
  parseSha256Manifest,
  pickPlatformAsset,
  verifySha256Digest,
  type GithubReleaseAssetLike,
} from '../src/shared/updaterUtils';

describe('v0.2.11-beta Seamless App Updater Utilities', () => {
  it('parses and compares beta and stable semver strings accurately', () => {
    expect(parseSemver('v0.2.11-beta')).toEqual({
      major: 0,
      minor: 2,
      patch: 11,
      prerelease: ['beta'],
    });
    expect(compareSemver('0.2.10-beta', '0.2.9-beta')).toBe(1);
    expect(compareSemver('v0.2.11-beta', '0.2.10-beta')).toBe(1);
    expect(compareSemver('0.2.11-beta', 'v0.2.11-beta')).toBe(0);
    expect(compareSemver('0.2.9-beta', '0.2.11-beta')).toBe(-1);
    expect(compareSemver('1.0.0', '1.0.0-beta')).toBe(1);
  });

  it('picks matching platform release binary and SHA256SUMS manifest', () => {
    const assets: GithubReleaseAssetLike[] = [
      {
        name: 'XRPL-Command-Center-0.2.11-beta-linux-x86_64.AppImage',
        url: 'https://api.github.com/assets/1',
        browser_download_url: 'https://github.com/dl/linux.AppImage',
        size: 113_000_000,
      },
      {
        name: 'SHA256SUMS-linux.txt',
        url: 'https://api.github.com/assets/2',
        browser_download_url: 'https://github.com/dl/SHA256SUMS-linux.txt',
        size: 120,
      },
      {
        name: 'XRPL-Command-Center-0.2.11-beta-win-x64-setup.exe',
        url: 'https://api.github.com/assets/3',
        browser_download_url: 'https://github.com/dl/win-setup.exe',
        size: 95_000_000,
      },
      {
        name: 'SHA256SUMS-win.txt',
        url: 'https://api.github.com/assets/4',
        browser_download_url: 'https://github.com/dl/SHA256SUMS-win.txt',
        size: 120,
      },
      {
        name: 'XRPL-Command-Center-0.2.11-beta-mac-arm64.dmg',
        url: 'https://api.github.com/assets/5',
        browser_download_url: 'https://github.com/dl/mac.dmg',
        size: 105_000_000,
      },
      {
        name: 'SHA256SUMS-mac.txt',
        url: 'https://api.github.com/assets/6',
        browser_download_url: 'https://github.com/dl/SHA256SUMS-mac.txt',
        size: 120,
      },
    ];

    const linux = pickPlatformAsset(assets, 'linux');
    expect(linux.binary?.name).toContain('.AppImage');
    expect(linux.checksumFile?.name).toBe('SHA256SUMS-linux.txt');

    const win = pickPlatformAsset(assets, 'win32');
    expect(win.binary?.name).toContain('setup.exe');
    expect(win.checksumFile?.name).toBe('SHA256SUMS-win.txt');

    const mac = pickPlatformAsset(assets, 'darwin');
    expect(mac.binary?.name).toContain('.dmg');
    expect(mac.checksumFile?.name).toBe('SHA256SUMS-mac.txt');
  });

  it('extracts expected SHA-256 hash from sha256sum manifests', () => {
    const hash = '38933368ec4e66bcf286abf80eb8e48ad20fd42b4fba7a39eddb4db6ee271f28';
    const manifest = `${hash}  XRPL-Command-Center-0.2.11-beta-linux-x86_64.AppImage\n`;
    expect(
      parseSha256Manifest(manifest, 'XRPL-Command-Center-0.2.11-beta-linux-x86_64.AppImage')
    ).toBe(hash);
    expect(parseSha256Manifest(manifest, 'other.AppImage')).toBeNull();
  });

  it('verifies matching SHA-256 digests and rejects tampered binaries', () => {
    const expected = 'a'.repeat(64);
    const ok = verifySha256Digest('A'.repeat(64), expected);
    expect(ok.ok).toBe(true);
    expect(ok.verified).toBe(true);

    const bad = verifySha256Digest('b'.repeat(64), expected);
    expect(bad.ok).toBe(false);
    expect(bad.verified).toBe(false);
    expect(bad.reason).toContain('MISMATCH');

    const noManifest = verifySha256Digest('a'.repeat(64), null);
    expect(noManifest.ok).toBe(true);
    expect(noManifest.verified).toBe(false);
  });
});
