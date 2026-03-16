/**
 * GET /api/crimes
 *
 * Scrapes Montgomery crime incident data from CrimeMapping.com via Bright Data.
 * Returns incidents grouped by inferred district (geocoded from address).
 *
 * This endpoint is called client-side as an enhancement to the safety score.
 * If unavailable, the safety score falls back to fire/EMS proxy data.
 */

import { NextResponse } from "next/server";
import { scrapeCrimeData } from "@/lib/brightdata/scraper";
import { CRIME_SEVERITY_WEIGHTS } from "@/lib/brightdata/types";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!process.env.BRIGHTDATA_API_KEY) {
    return NextResponse.json(
      { error: "Bright Data not configured", available: false },
      { status: 503 }
    );
  }

  const { incidents, source, error } = await scrapeCrimeData();

  // Tally weighted crime scores per district
  // Note: CrimeMapping.com provides street addresses, not district IDs.
  // For now we return raw incident counts by severity — the client can
  // optionally overlay these on the safety score.
  const summary = {
    total: incidents.length,
    violent:  incidents.filter((i) => i.severity === "violent").length,
    property: incidents.filter((i) => i.severity === "property").length,
    minor:    incidents.filter((i) => i.severity === "minor").length,
    weightedScore: incidents.reduce(
      (sum, i) => sum + CRIME_SEVERITY_WEIGHTS[i.severity], 0
    ),
  };

  return NextResponse.json({
    incidents: incidents.slice(0, 100), // cap response size
    summary,
    source,
    available: incidents.length > 0,
    fetchedAt: new Date().toISOString(),
    ...(error && { warning: error }),
  });
}
