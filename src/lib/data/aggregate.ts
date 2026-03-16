/**
 * District Data Aggregation
 *
 * Assigns ArcGIS features to council districts and computes DistrictRawData
 * per district. Features that include a district field are assigned directly;
 * features with only lat/lon geometry are assigned via point-in-polygon.
 */

import type { ArcGISFeature, DistrictRawData } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Map of district id → polygon rings ([lng, lat] pairs) */
type Boundaries = Map<number, number[][][]>;

// ─── Spatial Helpers ──────────────────────────────────────────────────────────

/**
 * Ray-casting point-in-polygon test.
 * Coordinates use GeoJSON order: ring[i] = [longitude, latitude].
 */
function isPointInPolygon(lng: number, lat: number, rings: number[][][]): boolean {
  for (const ring of rings) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    if (inside) return true;
  }
  return false;
}

/**
 * Build a district → polygon-rings lookup from council district features.
 * The `Id` attribute on each feature is the integer district number (1–9).
 */
export function buildBoundaries(features: ArcGISFeature[]): Boundaries {
  const map = new Map<number, number[][][]>();
  for (const f of features) {
    const id = f.attributes.Id as number;
    if (id && f.geometry?.rings) {
      map.set(id, f.geometry.rings as number[][][]);
    }
  }
  return map;
}

/** Assign a point feature to a district via spatial lookup. Returns null if outside all districts. */
function districtFromGeometry(f: ArcGISFeature, boundaries: Boundaries): number | null {
  const x = f.geometry?.x;
  const y = f.geometry?.y;
  if (x == null || y == null || isNaN(x) || isNaN(y)) return null;
  for (const [id, rings] of boundaries) {
    if (isPointInPolygon(x, y, rings)) return id;
  }
  return null;
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const NOW = Date.now();

/** Rolling time cutoffs */
export const CUT_90D  = NOW - 90  * DAY_MS; // start of current 90-day window
export const CUT_180D = NOW - 180 * DAY_MS; // start of prior 90-day window

/** Parse an ArcGIS date value (epoch ms number or ISO date string) to a timestamp. */
function toMs(val: unknown): number {
  if (typeof val === "number" && val > 0) return val;
  if (typeof val === "string") {
    const t = new Date(val).getTime();
    return isNaN(t) ? 0 : t;
  }
  return 0;
}

// ─── District Initializer ─────────────────────────────────────────────────────

function emptyRaw(): DistrictRawData {
  return {
    fireResponseCount90d: 0,
    fireResponseCountPrev90d: 0,
    nuisanceCount90d: 0,
    violentCrimes90d: 0,
    violentCrimesPrev90d: 0,
    propertyCrimes90d: 0,
    propertyCrimesPrev90d: 0,
    minorOffenses90d: 0,
    minorOffensesPrev90d: 0,
    permits180d: 0,
    permitsNewConstruction: 0,
    bizLicensesActive: 0,
    bizLicensesNew: 0,
    permits180dPrev: 0,
    permitsNewConstructionPrev: 0,
    bizLicensesNewPrev: 0,
    requests311Total: 0,
    requests311Resolved: 0,
    avgResolutionDays: 0,
    requests311TotalPrev: 0,
    requests311ResolvedPrev: 0,
    avgResolutionDaysPrev: 0,
    codeViolationsOpen: 0,
    codeViolationsClosedRate: 0,
    codeViolationsOpenPrev: 0,
    codeViolationsClosedRatePrev: 0,
    fireStations: 0,
    policeStations: 0,
    parks: 0,
    communityCenters: 0,
    schools: 0,
    pharmacies: 0,
    shelters: 0,
    priorOverallScore: 0,
  };
}

function initDistricts(): Record<number, DistrictRawData> {
  const r: Record<number, DistrictRawData> = {};
  for (let i = 1; i <= 9; i++) r[i] = emptyRaw();
  return r;
}

/** Guard: check district id is valid (1–9) */
function validDistrict(d: number | null): d is number {
  return d !== null && d >= 1 && d <= 9;
}

// ─── Main Aggregation ─────────────────────────────────────────────────────────

export interface AggregateInput {
  districtFeatures: ArcGISFeature[];
  permits: ArcGISFeature[];
  licenses: ArcGISFeature[];
  requests311: ArcGISFeature[];
  codeViolations: ArcGISFeature[];
  fireResponses: ArcGISFeature[];
  nuisances: ArcGISFeature[];
  stations: ArcGISFeature[];   // Fire+Police stations (category field distinguishes type)
  parks: ArcGISFeature[];      // Parks_and_Trail dataset (may also include community centers)
  schools: ArcGISFeature[];
  pharmacies: ArcGISFeature[];
  shelters: ArcGISFeature[];
}

/**
 * Aggregate all ArcGIS feature data into per-district raw counts.
 * Uses direct district fields where available; falls back to point-in-polygon
 * for datasets without a district assignment field.
 */
export function aggregateAllData(data: AggregateInput): Record<number, DistrictRawData> {
  const bounds = buildBoundaries(data.districtFeatures);
  const raw = initDistricts();

  // ── Fire/EMS Responses ──────────────────────────────────────────────────────
  // District field: `District` (integer). Date field: `Alarm_Date_Time` (epoch ms).
  // NOTE: This dataset was last updated May 2022. We fetch the 2000 most recent
  // records (ordered by OBJECTID DESC) and use them as a relative baseline.
  // We split the 2000 records evenly into "current" vs "prior" halves for the
  // trend calculation, enabling valid district-to-district comparisons.
  const halfPoint = Math.floor(data.fireResponses.length / 2);
  data.fireResponses.forEach((f, idx) => {
    const d = f.attributes.District as number | undefined;
    if (!validDistrict(d ?? null)) return;
    if (idx < halfPoint) raw[d!].fireResponseCount90d++;
    else                 raw[d!].fireResponseCountPrev90d++;
  });

  // ── Environmental Nuisance ──────────────────────────────────────────────────
  // No district field — use point geometry. Only 330 total records in dataset;
  // count all of them as a proxy for nuisance density per district.
  for (const f of data.nuisances) {
    const d = districtFromGeometry(f, bounds);
    if (!validDistrict(d)) continue;
    raw[d].nuisanceCount90d++;
  }

  // ── Construction Permits ────────────────────────────────────────────────────
  // District field: `DistrictCouncil` (integer). Date field: `IssuedDate` (ISO string).
  for (const f of data.permits) {
    const d = f.attributes.DistrictCouncil as number | undefined;
    if (!validDistrict(d ?? null)) continue;
    const t = toMs(f.attributes.IssuedDate);
    if (t >= CUT_180D) {
      raw[d!].permits180d++;
      if (f.attributes.ProjectType === "New") raw[d!].permitsNewConstruction++;
    }
  }

  // ── Business Licenses ───────────────────────────────────────────────────────
  // No district field — use point geometry.
  // Active = expiry date >= today; New = issued within 180d and not a renewal.
  for (const f of data.licenses) {
    if (f.attributes.CITY !== "YES") continue; // exclude county licenses
    const d = districtFromGeometry(f, bounds);
    if (!validDistrict(d)) continue;
    const expire = toMs(f.attributes.pvEXPIRE);
    if (expire >= NOW) {
      raw[d].bizLicensesActive++;
      const issued = toMs(f.attributes.pvEFFDATE);
      const isNew = f.attributes.pvrtDESC !== "Renew";
      if (issued >= CUT_180D && isNew) raw[d].bizLicensesNew++;
    }
  }

  // ── 311 Service Requests ────────────────────────────────────────────────────
  // District field: `District` (integer). Dates: `Create_Date`, `Close_Date` (epoch ms).
  const resolutionDaysByDistrict: Record<number, number[]> = {};
  for (let i = 1; i <= 9; i++) resolutionDaysByDistrict[i] = [];

  for (const f of data.requests311) {
    const d = f.attributes.District as number | undefined;
    if (!validDistrict(d ?? null)) continue;
    raw[d!].requests311Total++;
    if (f.attributes.Status === "Closed") {
      raw[d!].requests311Resolved++;
      const created = toMs(f.attributes.Create_Date);
      const closed  = toMs(f.attributes.Close_Date);
      if (closed > created) {
        resolutionDaysByDistrict[d!].push((closed - created) / DAY_MS);
      }
    }
  }
  for (let i = 1; i <= 9; i++) {
    const days = resolutionDaysByDistrict[i];
    raw[i].avgResolutionDays =
      days.length > 0
        ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10
        : 0;
  }

  // ── Code Violations ─────────────────────────────────────────────────────────
  // District field: `CouncilDistrict` (string like "DISTRICT 4" — parsed to int).
  // Open = CaseStatus does not contain "CLOS"/"COMPLI"/"RESOLV".
  const codeTotal: Record<number, number> = {};
  const codeClosed: Record<number, number> = {};
  for (let i = 1; i <= 9; i++) { codeTotal[i] = 0; codeClosed[i] = 0; }

  for (const f of data.codeViolations) {
    const raw_district = f.attributes.CouncilDistrict as string | undefined;
    if (!raw_district) continue;
    const match = String(raw_district).match(/(\d+)/);
    if (!match) continue;
    const d = parseInt(match[1]);
    if (!validDistrict(d)) continue;

    codeTotal[d]++;
    const status = String(f.attributes.CaseStatus || "").toUpperCase();
    if (status.includes("CLOS") || status.includes("COMPLI") || status.includes("RESOLV")) {
      codeClosed[d]++;
    } else {
      raw[d].codeViolationsOpen++;
    }
  }
  for (let i = 1; i <= 9; i++) {
    raw[i].codeViolationsClosedRate =
      codeTotal[i] > 0 ? codeClosed[i] / codeTotal[i] : 0;
  }

  // ── Fire & Police Stations ──────────────────────────────────────────────────
  // The `category` attribute contains the station type (e.g. "Fire", "Police").
  // Uses point-in-polygon for district assignment (no district field on this layer).
  for (const f of data.stations) {
    const d = districtFromGeometry(f, bounds);
    if (!validDistrict(d)) continue;
    const cat = String(f.attributes.category || "").toLowerCase();
    if (cat.includes("fire"))   raw[d].fireStations++;
    if (cat.includes("police")) raw[d].policeStations++;
  }

  // ── Community Resources — Parks & Community Centers ─────────────────────────
  // The Parks_and_Trail dataset includes community centers (FACILITYTYPE field).
  // No district field — use point geometry.
  for (const f of data.parks) {
    const d = districtFromGeometry(f, bounds);
    if (!validDistrict(d)) continue;
    if (f.attributes.FACILITYTYPE === "Community Center") {
      raw[d].communityCenters++;
    } else {
      raw[d].parks++;
    }
  }

  // ── Schools ─────────────────────────────────────────────────────────────────
  for (const f of data.schools) {
    const d = districtFromGeometry(f, bounds);
    if (validDistrict(d)) raw[d].schools++;
  }

  // ── Pharmacies ──────────────────────────────────────────────────────────────
  for (const f of data.pharmacies) {
    const d = districtFromGeometry(f, bounds);
    if (validDistrict(d)) raw[d].pharmacies++;
  }

  // ── Tornado Shelters ─────────────────────────────────────────────────────────
  for (const f of data.shelters) {
    const d = districtFromGeometry(f, bounds);
    if (validDistrict(d)) raw[d].shelters++;
  }

  return raw;
}
