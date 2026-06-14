import type { Version } from "#lib/version.js";

export default function parseVersion(version: Version): {
  major: number;
  minor: number;
  patch: number;
} {
  const versionParts = version.split(".");
  if (versionParts.length !== 3) {
    throw new Error(`Invalid version format: ${version}`);
  }

  const [major = 0, minor = 0, patch = 0] = versionParts.map((part) => {
    const num = parseInt(part, 10);
    if (isNaN(num)) {
      return 0;
    }

    return num;
  });

  return { major, minor, patch };
}

export function compareVersions(versionA: Version, versionB: Version): number {
  const parsedA = parseVersion(versionA);
  const parsedB = parseVersion(versionB);

  if (parsedA.major !== parsedB.major) {
    return parsedA.major - parsedB.major;
  }

  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor - parsedB.minor;
  }

  return parsedA.patch - parsedB.patch;
}
