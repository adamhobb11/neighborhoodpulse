/**
 * Snapshot store — reads from the git-committed snapshots.json file.
 *
 * snapshots.json is updated quarterly by running:
 *   npx tsx scripts/snapshot.ts
 *
 * The file is a static JSON import, which is safe on Vercel's read-only
 * runtime filesystem. No database or external service is required.
 *
 * To migrate to Vercel KV later, replace only the implementations of
 * readSnapshot and readDistrictSnapshot — the rest of the codebase is
 * unchanged.
 */

import type { QuarterlySnapshot } from "./types";
import snapshotData from "./snapshots.json";

type SnapshotFile = Record<string, QuarterlySnapshot[]>;

const snapshots = snapshotData as SnapshotFile;

/**
 * Returns all district snapshots for the given quarter key, or null if
 * no snapshot has been captured for that quarter yet.
 */
export function readSnapshot(quarter: string): QuarterlySnapshot[] | null {
  return snapshots[quarter] ?? null;
}

/**
 * Returns the snapshot for a specific district within a quarter, or null.
 */
export function readDistrictSnapshot(
  quarter: string,
  districtId: number
): QuarterlySnapshot | null {
  const q = snapshots[quarter];
  if (!q) return null;
  return q.find((s) => s.districtId === districtId) ?? null;
}

/**
 * Returns all quarters that have snapshots, sorted newest-first.
 * Useful for building a historical trend view across multiple quarters.
 */
export function listQuarters(): string[] {
  return Object.keys(snapshots).sort().reverse();
}
