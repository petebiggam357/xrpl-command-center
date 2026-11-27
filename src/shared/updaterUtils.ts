// v0.2.11-beta: Pure Semver Comparison, Platform Asset Selection & SHA-256 Manifest Verification

export interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

export interface GithubReleaseAssetLike {
  name: string;
  url: string;
  browser_download_url: string;
  size: number;
}

export interface SelectedPlatformAssets {
  binary: GithubReleaseAssetLike | null;
  checksumFile: GithubReleaseAssetLike | null;
}

/**
 * Parses semver tags like "v0.2.11-beta", "0.2.10-beta", "1.0.0", or "v1.2.3-rc.1".
 */
export function parseSemver(raw: string): ParsedSemver | null {
  const cleaned = String(raw ?? '').trim().replace(/^v/i, '');
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

/**
 * Standard SemVer 2.0 comparison: returns 1 if a > b, -1 if a < b, 0 if equal.
 * Properly handles numeric patch increments (0.2.10-beta > 0.2.9-beta) and prerelease vs stable (1.0.0 > 1.0.0-beta).
 */
export function compareSemver(aRaw: string, bRaw: string): number {
  const a = parseSemver(aRaw);
  const b = parseSemver(bRaw);
  if (!a || !b) {
    return aRaw.localeCompare(bRaw);
  }

  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;

  // Release without prerelease has higher precedence than prerelease
  if (a.prerelease.length === 0 && b.prerelease.length > 0) return 1;
  if (a.prerelease.length > 0 && b.prerelease.length === 0) return -1;

  const len = Math.max(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < len; i++) {
    const ai = a.prerelease[i];
    const bi = b.prerelease[i];
    if (ai === undefined) return -1;
    if (bi === undefined) return 1;
    const aNum = /^\d+$/.test(ai) ? Number(ai) : null;
    const bNum = /^\d+$/.test(bi) ? Number(bi) : null;
    if (aNum !== null && bNum !== null) {
      if (aNum !== bNum) return aNum > bNum ? 1 : -1;
    } else if (aNum !== null && bNum === null) {
      return -1;
    } else if (aNum === null && bNum !== null) {
      return 1;
    } else if (ai !== bi) {
      return ai > bi ? 1 : -1;
    }
  }
  return 0;
}

/**
 * Selects the best binary and SHA256SUMS manifest for the current OS platform.
 */
export function pickPlatformAsset(
  assets: GithubReleaseAssetLike[],
  platform: string
): SelectedPlatformAssets {
  const list = Array.isArray(assets) ? assets : [];
  if (platform === 'linux') {
    const binary =
      list.find((a) => /\.AppImage$/i.test(a.name) && /x86_64|x64|amd64/i.test(a.name)) ??
      list.find((a) => /\.AppImage$/i.test(a.name)) ??
      null;
    const checksumFile =
      list.find((a) => /^SHA256SUMS-linux\.txt$/i.test(a.name)) ??
      list.find((a) => /SHA256SUMS/i.test(a.name)) ??
      null;
    return { binary, checksumFile };
  }

  if (platform === 'win32') {
    const binary =
      list.find((a) => /setup\.exe$/i.test(a.name)) ??
      list.find((a) => /\.exe$/i.test(a.name)) ??
      null;
    const checksumFile =
      list.find((a) => /^SHA256SUMS-win\.txt$/i.test(a.name)) ??
      list.find((a) => /SHA256SUMS/i.test(a.name)) ??
      null;
    return { binary, checksumFile };
  }

  if (platform === 'darwin') {
    const binary =
      list.find((a) => /\.dmg$/i.test(a.name)) ??
      list.find((a) => /\.zip$/i.test(a.name)) ??
      null;
    const checksumFile =
      list.find((a) => /^SHA256SUMS-mac\.txt$/i.test(a.name)) ??
      list.find((a) => /SHA256SUMS/i.test(a.name)) ??
      null;
    return { binary, checksumFile };
  }

  return { binary: null, checksumFile: null };
}

/**
 * Extracts the expected 64-char hex SHA-256 digest for `targetFilename` from a `sha256sum` manifest.
 */
export function parseSha256Manifest(manifestText: string, targetFilename: string): string | null {
  const cleanTarget = targetFilename.trim().toLowerCase();
  const lines = String(manifestText ?? '').split(/\r?\n/);
  for (const line of lines) {
    const m = line.trim().match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
    if (!m) continue;
    const digest = m[1].toLowerCase();
    const file = m[2].trim().replace(/^\.\//, '').toLowerCase();
    if (file === cleanTarget || file.endsWith(`/${cleanTarget}`)) {
      return digest;
    }
  }
  return null;
}

/**
 * Verifies a computed SHA-256 hex digest against an expected manifest digest.
 */
export function verifySha256Digest(
  actualHex: string,
  expectedHex: string | null
): { ok: boolean; verified: boolean; reason: string } {
  const actual = String(actualHex ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(actual)) {
    return { ok: false, verified: false, reason: 'Computed SHA-256 digest is invalid.' };
  }
  if (!expectedHex) {
    return {
      ok: true,
      verified: false,
      reason: 'No SHA256SUMS entry attached to release; downloaded over HTTPS.',
    };
  }
  const expected = expectedHex.trim().toLowerCase();
  if (actual === expected) {
    return { ok: true, verified: true, reason: `SHA-256 verified (${actual.slice(0, 12)}…)` };
  }
  return {
    ok: false,
    verified: false,
    reason: `SHA-256 MISMATCH! Expected ${expected.slice(0, 12)}…, got ${actual.slice(0, 12)}…`,
  };
}
