/**
 * ArcGIS REST API Client
 * Fetches data from Montgomery's Open Data Portal endpoints.
 *
 * All endpoints are publicly accessible — no API key required.
 * Data is served via ArcGIS Feature Services with JSON/GeoJSON support.
 */

import { ENDPOINTS, buildQueryUrl } from "./endpoints";
import type { ArcGISResponse } from "./types";

const FETCH_TIMEOUT = 15000; // 15 second timeout

/**
 * Generic ArcGIS query fetcher with error handling and timeout.
 */
async function queryFeatureService<T>(
  endpoint: string,
  params: {
    where?: string;
    outFields?: string;
    returnGeometry?: boolean;
    resultRecordCount?: number;
    orderByFields?: string;
  } = {}
): Promise<ArcGISResponse<T>> {
  const url = buildQueryUrl(endpoint, params);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`ArcGIS API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // ArcGIS sometimes returns error objects instead of features
    if (data.error) {
      throw new Error(`ArcGIS query error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    return data as ArcGISResponse<T>;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timeout for ${endpoint}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch council district boundary polygons.
 * Returns the 9 council districts with their polygon geometries.
 */
export async function fetchCouncilDistricts() {
  return queryFeatureService(ENDPOINTS.councilDistricts2024, {
    outFields: "*",
    returnGeometry: true,
  });
}

/** Format a Date as "YYYY-MM-DD" for ArcGIS DateOnly field comparisons (DATE '...').  */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch construction permits issued in the last N days.
 * `IssuedDate` is esriFieldTypeDateOnly — use DATE '...' syntax.
 */
export async function fetchConstructionPermits(days: number = 180) {
  const since = isoDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
  return queryFeatureService(ENDPOINTS.constructionPermits, {
    where: `IssuedDate >= DATE '${since}'`,
    outFields: "OBJECTID,IssuedDate,ProjectType,DistrictCouncil,PermitStatus",
    returnGeometry: false,
    resultRecordCount: 2000,
  });
}

/**
 * Fetch currently active business licenses (expiry in future) for City of Montgomery.
 * `pvEXPIRE` is esriFieldTypeDateOnly — use DATE '...' syntax.
 */
export async function fetchBusinessLicenses() {
  const today = isoDate(new Date());
  return queryFeatureService(ENDPOINTS.businessLicense, {
    where: `pvEXPIRE >= DATE '${today}' AND CITY = 'YES'`,
    outFields: "OBJECTID,pvEFFDATE,pvEXPIRE,pvrtDESC,CITY",
    returnGeometry: true,
    resultRecordCount: 2000,
  });
}

/**
 * Fetch 311 service requests (scored on resolution rate, not a rolling window).
 */
export async function fetchServiceRequests311() {
  return queryFeatureService(ENDPOINTS.serviceRequests311, {
    outFields: "OBJECTID,District,Status,Create_Date,Close_Date",
    returnGeometry: false,
    resultRecordCount: 2000,
  });
}

/**
 * Fetch code violations (scored on open count and closure rate).
 */
export async function fetchCodeViolations() {
  return queryFeatureService(ENDPOINTS.codeViolations, {
    outFields: "OBJECTID,CaseStatus,CouncilDistrict",
    returnGeometry: false,
    resultRecordCount: 2000,
  });
}

/**
 * Fetch the most recent fire/EMS incidents ordered by recency.
 * NOTE: The Fire_Responses_view dataset was last updated May 2022.
 * We fetch the 2000 most recent records and use relative district comparisons.
 * `Alarm_Date_Time` is esriFieldTypeDate — stored as epoch ms.
 */
export async function fetchFireResponses() {
  return queryFeatureService(ENDPOINTS.fireResponses, {
    outFields: "OBJECTID,Alarm_Date_Time,District,Incident_Type",
    returnGeometry: false,
    orderByFields: "OBJECTID DESC",
    resultRecordCount: 2000,
  });
}

/**
 * Fetch all environmental nuisance reports (only 330 total in dataset).
 * Requires geometry for point-in-polygon district assignment.
 */
export async function fetchEnvironmentalNuisance() {
  return queryFeatureService(ENDPOINTS.environmentalNuisance, {
    outFields: "OBJECTID,Source_Date,Type",
    returnGeometry: true,
    resultRecordCount: 2000,
  });
}

/**
 * Fetch fire and police station locations (layer 3 of Story Map service).
 * The `category` attribute distinguishes fire stations from police stations.
 */
export async function fetchFirePoliceStations() {
  return queryFeatureService(ENDPOINTS.firePoliceStations, {
    outFields: "OBJECTID,Facility_Name,category,Address",
    returnGeometry: true,
  });
}


/**
 * Fetch parks and trail locations.
 */
export async function fetchParksAndTrails() {
  return queryFeatureService(ENDPOINTS.parksAndTrail, {
    outFields: "*",
    returnGeometry: true,
  });
}

/**
 * Fetch community center locations.
 */
export async function fetchCommunityCenters() {
  return queryFeatureService(ENDPOINTS.communityCenters, {
    outFields: "*",
    returnGeometry: true,
  });
}

/**
 * Fetch education facility locations.
 */
export async function fetchEducationFacilities() {
  return queryFeatureService(ENDPOINTS.educationFacilities, {
    outFields: "*",
    returnGeometry: true,
  });
}

/**
 * Fetch pharmacy locations.
 */
export async function fetchPharmacies() {
  return queryFeatureService(ENDPOINTS.pharmacyLocator, {
    outFields: "*",
    returnGeometry: true,
  });
}

/**
 * Fetch tornado shelter locations.
 */
export async function fetchTornadoShelters() {
  return queryFeatureService(ENDPOINTS.tornadoShelters, {
    outFields: "*",
    returnGeometry: true,
  });
}

/**
 * Fetch all datasets in parallel for scoring.
 * Uses Promise.allSettled so a single failing endpoint doesn't block the others.
 */
export async function fetchAllDatasets() {
  const [
    districts,
    permits,
    licenses,
    requests311,
    codeViolations,
    fireResponses,
    nuisances,
    stations,
    parks,
    schools,
    pharmacies,
    shelters,
  ] = await Promise.allSettled([
    fetchCouncilDistricts(),
    fetchConstructionPermits(),
    fetchBusinessLicenses(),
    fetchServiceRequests311(),
    fetchCodeViolations(),
    fetchFireResponses(),
    fetchEnvironmentalNuisance(),
    fetchFirePoliceStations(),
    fetchParksAndTrails(),        // also contains community centers (FACILITYTYPE field)
    fetchEducationFacilities(),
    fetchPharmacies(),
    fetchTornadoShelters(),
  ]);

  const all = [districts, permits, licenses, requests311, codeViolations, fireResponses, nuisances, stations, parks, schools, pharmacies, shelters];

  return {
    districts:      districts.status      === "fulfilled" ? districts.value      : null,
    permits:        permits.status        === "fulfilled" ? permits.value        : null,
    licenses:       licenses.status       === "fulfilled" ? licenses.value       : null,
    requests311:    requests311.status    === "fulfilled" ? requests311.value    : null,
    codeViolations: codeViolations.status === "fulfilled" ? codeViolations.value : null,
    fireResponses:  fireResponses.status  === "fulfilled" ? fireResponses.value  : null,
    nuisances:      nuisances.status      === "fulfilled" ? nuisances.value      : null,
    stations:       stations.status       === "fulfilled" ? stations.value       : null,
    parks:          parks.status          === "fulfilled" ? parks.value          : null,
    schools:        schools.status        === "fulfilled" ? schools.value        : null,
    pharmacies:     pharmacies.status     === "fulfilled" ? pharmacies.value     : null,
    shelters:       shelters.status       === "fulfilled" ? shelters.value       : null,
    errors: all
      .filter((r) => r.status === "rejected")
      .map((r) => (r as PromiseRejectedResult).reason?.message || "Unknown error"),
    fetchedAt: new Date().toISOString(),
  };
}
