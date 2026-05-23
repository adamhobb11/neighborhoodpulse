/**
 * GET /api/scores
 *
 * Fetches live data from Montgomery's ArcGIS Open Data Portal,
 * aggregates it by council district, and computes health index scores.
 *
 * Returns an error if live data is unavailable — never falls back to mock data.
 */

import { NextResponse } from "next/server";
import { fetchAllDatasets } from "@/lib/data/arcgis";
import { aggregateAllData } from "@/lib/data/aggregate";
import { calculateDistrictScores } from "@/lib/scoring/engine";
import { DISTRICTS } from "@/lib/data/mockData";

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

    // ── Score each district ───────────────────────────────────────────────
    const districtData = DISTRICTS.map((district) => {
      const raw = rawByDistrict[district.id];
      const scores = calculateDistrictScores(raw, district.population);
      return { district, scores, raw };
    });

    return NextResponse.json({
      data: districtData,
      source: "live",
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
