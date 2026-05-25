/**
 * scripts/snapshot.ts
 *
 * Captures the current district scores as a quarterly snapshot and appends
 * them to src/lib/data/snapshots.json without overwriting prior quarters.
 *
 * Run this once per quarter (ideally within the last week of the quarter,
 * before the new quarter opens). After running, commit the updated file:
 *
 *   npx tsx scripts/snapshot.ts [--url <base-url>]
 *   git add src/lib/data/snapshots.json
 *   git commit -m "snapshot: capture 2026-Q2 district health scores"
 *   git push
 *
 * Options:
 *   --url <base-url>   Base URL of the running app (default: http://localhost:3000)
 *                      Use the Vercel production URL to capture from live data:
 *                      npx tsx scripts/snapshot.ts --url https://neighborhoodpulse.vercel.app
 *
 * The first snapshot creates the Q-over-Q baseline. True QoQ comparisons
 * appear in the dashboard starting the following quarter.
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

// ── Types (inlined to keep script self-contained) ────────────────────────────

interface QuarterlySnapshot {
  quarter:      string;
  snapshotDate: string;
  districtId:   number;
  overall:      number;
  safety:       number;
  economic:     number;
  services:     number;
  code:         number;
  community:    number;
  label:        string;
}

interface ScoresApiResponse {
  data: Array<{
    district: { id: number };
    scores: {
      overall:   number;
      safety:    number;
      economic:  number;
      services:  number;
      code:      number;
      community: number;
      label:     string;
    };
  }>;
  source?: string;
}

// ── Quarter utilities (inlined) ───────────────────────────────────────────────

function getQuarterKey(date = new Date()): string {
  const q = Math.ceil((date.getMonth() + 1) / 3);
  return `${date.getFullYear()}-Q${q}`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const urlIdx = args.indexOf("--url");
  const baseUrl = urlIdx >= 0 ? args[urlIdx + 1] : "http://localhost:3000";

  if (!baseUrl) {
    console.error("Error: --url flag provided but no value given.");
    process.exit(1);
  }

  const apiUrl = `${baseUrl}/api/scores`;
  console.log(`\nNeighborhoodPulse Snapshot Capture`);
  console.log(`────────────────────────────────────`);
  console.log(`Fetching scores from: ${apiUrl}`);

  let res: Response;
  try {
    res = await fetch(apiUrl);
  } catch (err) {
    console.error(`\nFailed to reach API: ${err}`);
    console.error(`Make sure the app is running at ${baseUrl}`);
    console.error(`For production: npx tsx scripts/snapshot.ts --url https://neighborhoodpulse.vercel.app`);
    process.exit(1);
  }

  if (!res.ok) {
    const body = await res.text();
    console.error(`\nAPI returned ${res.status}:\n${body}`);
    process.exit(1);
  }

  const json = (await res.json()) as ScoresApiResponse;

  if (!json.data?.length) {
    console.error("\nAPI response missing data array. Cannot create snapshot.");
    process.exit(1);
  }

  const quarter      = getQuarterKey();
  const snapshotDate = new Date().toISOString();

  const snapshots: QuarterlySnapshot[] = json.data.map(({ district, scores }) => ({
    quarter,
    snapshotDate,
    districtId: district.id,
    overall:    scores.overall,
    safety:     scores.safety,
    economic:   scores.economic,
    services:   scores.services,
    code:       scores.code,
    community:  scores.community,
    label:      scores.label,
  }));

  // ── Load existing snapshots file ────────────────────────────────────────────
  const snapshotsPath = join(process.cwd(), "src/lib/data/snapshots.json");
  let existing: Record<string, QuarterlySnapshot[]>;
  try {
    existing = JSON.parse(readFileSync(snapshotsPath, "utf-8"));
  } catch {
    console.error(`\nCould not read ${snapshotsPath}`);
    console.error("Make sure you are running this script from the project root.");
    process.exit(1);
  }

  // ── Warn if overwriting — never silently discard history ────────────────────
  if (existing[quarter]) {
    console.warn(`\n⚠  A snapshot for ${quarter} already exists.`);
    console.warn("   It will be overwritten with the current scores.");
    console.warn("   To keep both, rename the existing key before re-running.\n");
  }

  existing[quarter] = snapshots;

  // ── Write updated file ──────────────────────────────────────────────────────
  writeFileSync(snapshotsPath, JSON.stringify(existing, null, 2) + "\n", "utf-8");

  // ── Report ──────────────────────────────────────────────────────────────────
  console.log(`\n✓ Captured ${snapshots.length} district snapshots for ${quarter}`);
  console.log(`  Source:        ${json.source ?? "unknown"}`);
  console.log(`  Snapshot date: ${snapshotDate}`);
  console.log();
  console.log("  District scores captured:");
  for (const s of snapshots.sort((a, b) => a.districtId - b.districtId)) {
    console.log(
      `    D${s.districtId}  overall=${s.overall}  ` +
      `safety=${s.safety}  econ=${s.economic}  ` +
      `svc=${s.services}  code=${s.code}  comm=${s.community}  ` +
      `[${s.label}]`
    );
  }
  console.log();
  console.log("  Next steps:");
  console.log("    git add src/lib/data/snapshots.json");
  console.log(`    git commit -m "snapshot: capture ${quarter} district health scores"`);
  console.log("    git push");
  console.log();
  console.log(`  QoQ trends will appear in the dashboard starting next quarter.`);
}

main().catch((err: unknown) => {
  console.error("\nSnapshot capture failed:", err);
  process.exit(1);
});
