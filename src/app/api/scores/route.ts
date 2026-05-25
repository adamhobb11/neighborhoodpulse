/**
 * GET /api/scores
 *
 * Fetches live data from Montgomery's ArcGIS Open Data Portal,
 * aggregates it by council district, and computes health index scores.
 *
 * Also loads the prior-quarter snapshot (if one exists) and injects it
 * as `priorQuarter` into each DistrictData item so the client can render
 * true quarter-over-quarter trend comparisons.
 *
 * Returns an error if live data is unavailable — never falls back to mock data.
 */

import { NextResponse } from "next/server";
import { fetchAllDatasets } from "@/lib/data/arcgis";
import { aggregateAllData } from "@/lib/data/aggregate";
import { calculateDistrictScores } from "@/lib/scoring/engine";
import { DISTRICTS } from "@/lib/data/mockData";
import { getPriorQuarterKey } from "@/lib/data/quarters";
import { readSnapshot } from "@/lib/data/snapshotStore";
import type { QuarterlySnapshot } from "@/lib/data/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    // ── Fetch live data from ArcGIS ──────────────────────────────────────
    const datasets = await fetchAllDatasets();

    // Council district boundaries are required for spatial joins
    if (!datasets.districts?.features?.length) {
      return NextResponse.json(
        {
          error: "Council district boundaries unavailable — cannot compute scores",
          details: "The ArcGIS council districts endpoint did not return boundary data. All spatial joins depend on this dataset.",
          failedEndpoints: datasets.errors,
        },
        { status: 502 }
      );
    }

    // ── Aggregate all features by district ────────────────────────────────
    const rawByDistrict = aggregateAllData({
      districtFeatures: datasets.districts.features,
      permits: datasets.permits?.features ?? [],
      licenses: datasets.licenses?.features ?? [],
      requests311: datasets.requests311?.features ?? [],
      codeViolations: datasets.codeViolations?.features ?? [],
      fireResponses: datasets.fireResponses?.features ?? [],
      nuisances: datasets.nuisances?.features ?? [],
      stations: datasets.stations?.features ?? [],
      parks: [
        ...(datasets.parks?.features ?? []),
        ...(datasets.centers?.features ?? []),
      ],
      schools: datasets.schools?.features ?? [],
      pharmacies: datasets.pharmacies?.features ?? [],
      shelters: datasets.shelters?.features ?? [],
    });

    // ── Load prior-quarter snapshot (null when no snapshot exists yet) ────
    const priorKey = getPriorQuarterKey();
    const priorSnapshots = readSnapshot(priorKey);
    const priorByDistrict: Record<number, QuarterlySnapshot> = {};
    if (priorSnapshots) {
      for (const s of priorSnapshots) {
        priorByDistrict[s.districtId] = s;
      }
    }

    // ── Score each district and attach prior-quarter data ─────────────────
    const districtData = DISTRICTS.map((district) => {
      const raw = rawByDistrict[district.id];
      const scores = calculateDistrictScores(raw, district.population);
      const priorQuarter = priorByDistrict[district.id];

      return {
        district,
        scores,
        raw,
        // undefined when no snapshot exists — client treats this as "no QoQ data"
        priorQuarter: priorQuarter ?? undefined,
      };
    });

    return NextResponse.json({
      data: districtData,
      source: "live",
      priorQuarterKey: priorSnapshots ? priorKey : null,
      warnings: datasets.errors.length > 0
        ? { partialData: true, failedEndpoints: datasets.errors }
        : undefined,
      fetchedAt: datasets.fetchedAt,
      dataPortal: "https://opendata.montgomeryal.gov",
    });
  } catch (error) {
    console.error("Failed to compute scores:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch live data from Montgomery's Open Data Portal",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 }
    );
  }
}
