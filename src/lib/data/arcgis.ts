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
async function queryFeatureService<T = Record<string, unknown>>(
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

/**
 * Fetch construction permits for the last N days.
 * IssuedDate is esriFieldTypeDateOnly — requires DATE 'YYYY-MM-DD' syntax.
 */
export async function fetchConstructionPermits(days: number = 365) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  return queryFeatureService(ENDPOINTS.constructionPermits, {
    where: `IssuedDate >= DATE '${since}'`,
    outFields: "*",
    returnGeometry: true,
    resultRecordCount: 2000,
    orderByFields: "OBJECTID DESC",
  });
}

/**
 * Fetch active business licenses for City of Montgomery.
 * pvEXPIRE is esriFieldTypeDateOnly — requires DATE 'YYYY-MM-DD' syntax.
 * CITY = 'YES' filters to city limits only (vs 'NO' for out-of-city businesses).
 */
export async function fetchBusinessLicenses() {
  const today = new Date().toISOString().slice(0, 10);
  return queryFeatureService(ENDPOINTS.businessLicense, {
    where: `pvEXPIRE >= DATE '${today}' AND CITY = 'YES'`,
    outFields: "*",
    returnGeometry: true,
    resultRecordCount: 2000,
  });
}

/**
 * Fetch 311 service requests.
 */
export async function fetchServiceRequests311() {
  return queryFeatureService(ENDPOINTS.serviceRequests311, {
    outFields: "*",
    returnGeometry: true,
    resultRecordCount: 2000,
    orderByFields: "OBJECTID DESC",
  });
}

/**
 * Fetch code violations.
 */
export async function fetchCodeViolations() {
  return queryFeatureService(ENDPOINTS.codeViolations, {
    outFields: "*",
    returnGeometry: true,
    resultRecordCount: 2000,
    orderByFields: "OBJECTID DESC",
  });
}

/**
 * Fetch fire/EMS response incidents.
 */
export async function fetchFireResponses() {
  return queryFeatureService(ENDPOINTS.fireResponses, {
    outFields: "*",
    returnGeometry: true,
    resultRecordCount: 2000,
    orderByFields: "OBJECTID DESC",
  });
}

/**
 * Fetch environmental nuisance reports.
 */
export async function fetchEnvironmentalNuisance() {
  return queryFeatureService(ENDPOINTS.environmentalNuisance, {
    outFields: "*",
    returnGeometry: true,
    resultRecordCount: 2000,
  });
}

/**
 * Fetch fire and police station locations.
 */
export async function fetchFirePoliceStations() {
  return queryFeatureService(ENDPOINTS.firePoliceStations, {
    outFields: "*",
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
export async function fetchShelters() {
  return queryFeatureService(ENDPOINTS.tornadoShelters, {
    outFields: "*",
    returnGeometry: true,
  });
}

/**
 * Fetch all datasets in parallel for scoring.
 * Returns an object with all dataset results.
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
    centers,
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
    fetchParksAndTrails(),
    fetchCommunityCenters(),
    fetchEducationFacilities(),
    fetchPharmacies(),
    fetchShelters(),
  ]);

  return {
    districts: districts.status === "fulfilled" ? districts.value : null,
    permits: permits.status === "fulfilled" ? permits.value : null,
    licenses: licenses.status === "fulfilled" ? licenses.value : null,
    requests311: requests311.status === "fulfilled" ? requests311.value : null,
    codeViolations: codeViolations.status === "fulfilled" ? codeViolations.value : null,
    fireResponses: fireResponses.status === "fulfilled" ? fireResponses.value : null,
    nuisances: nuisances.status === "fulfilled" ? nuisances.value : null,
    stations: stations.status === "fulfilled" ? stations.value : null,
    parks: parks.status === "fulfilled" ? parks.value : null,
    centers: centers.status === "fulfilled" ? centers.value : null,
    schools: schools.status === "fulfilled" ? schools.value : null,
    pharmacies: pharmacies.status === "fulfilled" ? pharmacies.value : null,
    shelters: shelters.status === "fulfilled" ? shelters.value : null,
    errors: [districts, permits, licenses, requests311, codeViolations, fireResponses, nuisances, stations, parks, centers, schools, pharmacies, shelters]
      .filter((r) => r.status === "rejected")
      .map((r) => (r as PromiseRejectedResult).reason?.message || "Unknown error"),
    fetchedAt: new Date().toISOString(),
  };
}
