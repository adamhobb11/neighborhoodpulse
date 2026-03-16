/**
 * GET /api/scores
 *
 * Fetches live data from Montgomery's ArcGIS Open Data Portal,
 * aggregates it by council district, and computes Neighborhood Health Index scores.
 *
 * Falls back to mock data if ArcGIS APIs are unreachable.
 */

import { NextResponse } from "next/server";
import { getMockDistrictData, DISTRICTS, MOCK_RAW_DATA } from "@/lib/data/mockData";
import { fetchAllDatasets } from "@/lib/data/arcgis";
import { aggregateAllData } from "@/lib/data/aggregate";
import { calculateDistrictScores } from "@/lib/scoring/engine";
import type { ArcGISFeature } from "@/lib/data/types";

type F = ArcGISFeature<Record<string, unknown>>;
const asFeatures = (arr: ArcGISFeature<unknown>[] | undefined): F[] =>
  (arr ?? []) as F[];

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const datasets = await fetchAllDatasets();

    // District boundary polygons are required — without them we can't do
    // point-in-polygon assignment for datasets that lack a district field.
    if (!datasets.districts || datasets.districts.features.length === 0) {
      throw new Error("Council district boundaries unavailable");
    }

    const rawByDistrict = aggregateAllData({
      districtFeatures: asFeatures(datasets.districts.features),
      permits:          asFeatures(datasets.permits?.features),
      licenses:         asFeatures(datasets.licenses?.features),
      requests311:      asFeatures(datasets.requests311?.features),
      codeViolations:   asFeatures(datasets.codeViolations?.features),
      fireResponses:    asFeatures(datasets.fireResponses?.features),
      nuisances:        asFeatures(datasets.nuisances?.features),
      stations:         asFeatures(datasets.stations?.features),
      parks:            asFeatures(datasets.parks?.features),
      schools:          asFeatures(datasets.schools?.features),
      pharmacies:       asFeatures(datasets.pharmacies?.features),
      shelters:         asFeatures(datasets.shelters?.features),
    });

    const districtData = DISTRICTS.map((district) => {
      const raw = rawByDistrict[district.id];
      // Inject prior-quarter reference score from mock data (no historical ArcGIS endpoint available)
      raw.priorOverallScore = MOCK_RAW_DATA[district.id]?.priorOverallScore ?? 0;
      const scores = calculateDistrictScores(raw, district.population);
      return { district, scores, raw };
    });

    const hasPartialErrors = datasets.errors.length > 0;

    return NextResponse.json({
      data: districtData,
      source: hasPartialErrors ? "live-partial" : "live",
      fetchedAt: datasets.fetchedAt,
      dataPortal: "https://opendata.montgomeryal.gov",
      ...(hasPartialErrors && { errors: datasets.errors }),
    });
  } catch (error) {
    console.error("Live data unavailable, falling back to mock:", error);

    const districtData = getMockDistrictData();
    return NextResponse.json({
      data: districtData,
      source: "mock",
      fetchedAt: new Date().toISOString(),
      dataPortal: "https://opendata.montgomeryal.gov",
    });
  }
}
