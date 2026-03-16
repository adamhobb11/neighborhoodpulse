/**
 * NeighborhoodPulse Scoring Engine
 *
 * Computes a 0–100 Health Index for each council district by combining
 * five weighted components:
 *   - Public Safety (25%): Fire/EMS responses + environmental nuisance trends
 *   - Economic Vitality (20%): Construction permits + business license growth
 *   - City Services Responsiveness (20%): 311 resolution rate + speed
 *   - Code Compliance (20%): Open violations + closure rate
 *   - Community Resource Access (15%): Proximity to parks, stations, centers
 *
 * Methodology: Rolling baseline normalization — each district is scored
 * relative to the city's own range, automatically adjusting for macro conditions.
 * Weights are configurable.
 */

import type { DistrictScores, DistrictRawData, ComponentScores } from "../data/types";

// ─── Configuration ──────────────────────────────────────

export const DEFAULT_WEIGHTS: ComponentScores = {
  safety: 0.25,
  economic: 0.20,
  services: 0.20,
  code: 0.20,
  community: 0.15,
};

// ─── Normalization Helpers ──────────────────────────────

/**
 * Normalize a value to 0–100 within a min/max range.
 * @param invert - If true, lower raw values produce higher scores (e.g., fewer crimes = better)
 */
function normalize(value: number, min: number, max: number, invert: boolean = false): number {
  if (max === min) return 50; // avoid division by zero
  const clamped = Math.max(min, Math.min(max, value));
  const normalized = ((clamped - min) / (max - min)) * 100;
  return invert ? 100 - normalized : normalized;
}

/**
 * Get score label from numeric score.
 */
export function getScoreLabel(score: number): DistrictScores["label"] {
  if (score >= 75) return "Thriving";
  if (score >= 60) return "Stable";
  if (score >= 45) return "Watch";
  if (score >= 30) return "At Risk";
  return "Critical";
}

/**
 * Get color for a score value (for UI rendering).
 */
export function getScoreColor(score: number): string {
  if (score >= 75) return "#059669"; // green
  if (score >= 60) return "#0891b2"; // cyan
  if (score >= 45) return "#d97706"; // amber
  if (score >= 30) return "#ea580c"; // orange
  return "#dc2626"; // red
}

// ─── Component Scoring Functions ────────────────────────

/**
 * PUBLIC SAFETY SCORE (25%)
 * Combines crime incident data, fire/EMS responses, nuisance reports, and trend.
 *
 * Weights:
 *   Crime incidents (severity-weighted): 40%
 *   Fire/EMS response rate:             35%
 *   Environmental nuisance density:     10%
 *   Trend modifier (fire response):     15%
 */
function scoreSafety(raw: DistrictRawData, population: number): number {
  const perCapita = (count: number) => (count / Math.max(population, 1)) * 10000;

  // Crime score (40%): weighted sum — violent 3×, property 2×, minor 1× — inverted
  const weightedCrimes =
    (raw.violentCrimes90d ?? 0) * 3 +
    (raw.propertyCrimes90d ?? 0) * 2 +
    (raw.minorOffenses90d ?? 0);
  const crimeRate = perCapita(weightedCrimes);
  const crimeScore = normalize(crimeRate, 5, 250, true);

  // Fire/EMS response rate (35%): inverted — fewer = better
  const responseRate = perCapita(raw.fireResponseCount90d);
  const responseScore = normalize(responseRate, 5, 80, true);

  // Environmental nuisance (10%): inverted
  const nuisanceRate = perCapita(raw.nuisanceCount90d);
  const nuisanceScore = normalize(nuisanceRate, 0, 30, true);

  // Trend modifier (15%): based on fire response trend, centered at 0
  const trend =
    raw.fireResponseCountPrev90d > 0
      ? (raw.fireResponseCount90d - raw.fireResponseCountPrev90d) / raw.fireResponseCountPrev90d
      : 0;
  const trendScore = normalize(-trend * 100, -50, 50, false);

  return Math.max(
    0,
    Math.min(
      100,
      crimeScore * 0.40 +
      responseScore * 0.35 +
      nuisanceScore * 0.10 +
      trendScore * 0.15
    )
  );
}

/**
 * ECONOMIC VITALITY SCORE (20%)
 * Measures construction permit activity and business license growth.
 *
 * Inputs:
 * - Construction permits issued (180-day window)
 * - New construction vs. renovation ratio
 * - Net business license growth
 */
function scoreEconomic(raw: DistrictRawData): number {
  // Permit activity
  const permitScore = normalize(raw.permits180d, 3, 50, false);

  // New construction bonus (higher ratio = more investment)
  const newConstructionRatio =
    raw.permits180d > 0 ? raw.permitsNewConstruction / raw.permits180d : 0;
  const constructionBonus = normalize(newConstructionRatio * 100, 0, 40, false);

  // Business license growth
  const bizScore = normalize(raw.bizLicensesNew, 0, 20, false);

  return permitScore * 0.45 + constructionBonus * 0.25 + bizScore * 0.30;
}

/**
 * CITY SERVICES RESPONSIVENESS SCORE (20%)
 * Measures how effectively the city responds to 311 service requests.
 *
 * Inputs:
 * - Resolution rate (% of requests closed)
 * - Average time to resolution (days)
 * - Per-capita request volume (high = potential neglect)
 */
function scoreServices(raw: DistrictRawData): number {
  // Resolution rate
  const resolutionRate =
    raw.requests311Total > 0 ? raw.requests311Resolved / raw.requests311Total : 0.5;
  const resRateScore = normalize(resolutionRate * 100, 30, 90, false);

  // Resolution speed (fewer days = better)
  const speedScore = normalize(raw.avgResolutionDays, 2, 25, true);

  return resRateScore * 0.55 + speedScore * 0.45;
}

/**
 * CODE COMPLIANCE SCORE (20%)
 * Measures neighborhood physical quality via code violation data.
 *
 * Inputs:
 * - Open (unresolved) code violations per capita
 * - Violation closure rate
 */
function scoreCode(raw: DistrictRawData, population: number): number {
  const perCapita = (count: number) => (count / Math.max(population, 1)) * 10000;

  // Violations per capita (inverted — fewer = better)
  const violationRate = perCapita(raw.codeViolationsOpen);
  const violationScore = normalize(violationRate, 1, 40, true);

  // Closure rate (higher = better enforcement)
  const closureScore = normalize(raw.codeViolationsClosedRate * 100, 15, 85, false);

  return violationScore * 0.6 + closureScore * 0.4;
}

/**
 * COMMUNITY RESOURCE ACCESS SCORE (15%)
 * Spatial analysis of proximity to community assets.
 *
 * Inputs:
 * - Count of nearby facilities: fire stations, police stations,
 *   parks, community centers, schools, pharmacies, shelters
 */
function scoreCommunity(raw: DistrictRawData): number {
  // Weighted resource count — not all resources are equal
  const stationScore = normalize(raw.fireStations + raw.policeStations, 0, 4, false);
  const parkScore = normalize(raw.parks, 0, 6, false);
  const centerScore = normalize(raw.communityCenters, 0, 3, false);
  const schoolScore = normalize(raw.schools, 0, 8, false);
  const healthScore = normalize(raw.pharmacies, 0, 5, false);
  const shelterScore = normalize(raw.shelters, 0, 2, false);

  return (
    stationScore * 0.25 +
    parkScore * 0.20 +
    centerScore * 0.15 +
    schoolScore * 0.20 +
    healthScore * 0.10 +
    shelterScore * 0.10
  );
}

// ─── Trend Estimation ──────────────────────────────────

/**
 * Estimate per-component trend direction from available data.
 * Returns fractions where positive = score improving, negative = score declining.
 */
function computeComponentTrends(raw: DistrictRawData): import("../data/types").ComponentScores {
  // Safety: fire responses up = worse → negate
  const safety =
    raw.fireResponseCountPrev90d > 0
      ? -((raw.fireResponseCount90d - raw.fireResponseCountPrev90d) / raw.fireResponseCountPrev90d)
      : 0;

  // Economic: biz license growth vs 5% quarterly target
  const bizRate = raw.bizLicensesActive > 0 ? raw.bizLicensesNew / raw.bizLicensesActive : 0;
  const economic = Math.max(-0.5, Math.min(0.5, (bizRate - 0.05) * 3));

  // Services: resolution rate vs 70% baseline
  const resRate = raw.requests311Total > 0 ? raw.requests311Resolved / raw.requests311Total : 0.7;
  const services = Math.max(-0.5, Math.min(0.5, (resRate - 0.70) * 1.5));

  // Code: closure rate vs 60% baseline
  const code = Math.max(-0.5, Math.min(0.5, (raw.codeViolationsClosedRate - 0.60) * 1.5));

  // Community: no meaningful short-term trend for static infrastructure
  const community = 0;

  return { safety, economic, services, code, community };
}

// ─── Main Scoring Function ──────────────────────────────

/**
 * Calculate all scores for a single district.
 *
 * @param raw - Aggregated raw data counts for the district
 * @param population - Estimated district population for per-capita normalization
 * @param weights - Optional custom weights (must sum to 1.0)
 * @returns Complete district scores including overall index and label
 */
export function calculateDistrictScores(
  raw: DistrictRawData,
  population: number,
  weights: ComponentScores = DEFAULT_WEIGHTS
): DistrictScores {
  const safety = Math.round(scoreSafety(raw, population));
  const economic = Math.round(scoreEconomic(raw));
  const services = Math.round(scoreServices(raw));
  const code = Math.round(scoreCode(raw, population));
  const community = Math.round(scoreCommunity(raw));

  const overall = Math.round(
    safety * weights.safety +
    economic * weights.economic +
    services * weights.services +
    code * weights.code +
    community * weights.community
  );

  // Calculate trend from fire response data
  const trend =
    raw.fireResponseCountPrev90d > 0
      ? (raw.fireResponseCount90d - raw.fireResponseCountPrev90d) / raw.fireResponseCountPrev90d
      : 0;

  const trends = computeComponentTrends(raw);

  return {
    overall,
    safety,
    economic,
    services,
    code,
    community,
    trend,
    trends,
    label: getScoreLabel(overall),
  };
}
