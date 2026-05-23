/**
 * Montgomery, AL — ArcGIS REST API Endpoints
 * Source: opendata.montgomeryal.gov (Open Data Portal)
 * Organization ID: xNUwUjOJqYE54USz
 *
 * These endpoints are publicly accessible Feature Services
 * hosted by the City of Montgomery's ArcGIS Online organization.
 */

const ARCGIS_BASE = "https://services7.arcgis.com/xNUwUjOJqYE54USz/arcgis/rest/services";
const GIS_BASE = "https://gis.montgomeryal.gov/server/rest/services/HostedDatasets";

export const ENDPOINTS = {
  // ─── Core Scoring Data ────────────────────────────────
  /** Construction permits — weekly updates. Feeds Economic Vitality score. */
  constructionPermits: `${GIS_BASE}/Construction_Permits/FeatureServer/0`,

  /** Business licenses — weekly updates. Feeds Economic Vitality score. */
  businessLicense: `${GIS_BASE}/Business_License/FeatureServer/0`,

  /** 311 service requests — continuously updated. Feeds City Services score. */
  serviceRequests311: `${GIS_BASE}/Received_311_Service_Request/MapServer/0`,

  /** Code violations — current. Feeds Code Compliance score. */
  codeViolations: `${GIS_BASE}/Code_Violations/FeatureServer/0`,

  /** Fire & EMS incident responses — with locations. Feeds Safety score. */
  fireResponses: `${ARCGIS_BASE}/Fire_Responses_view/FeatureServer`,

  /** Environmental nuisance reports — biweekly. Feeds Safety score. */
  environmentalNuisance: `${ARCGIS_BASE}/Environmental_Nuisance/FeatureServer`,

  // ─── Community Resource Locations ─────────────────────
  /** Fire and police station locations (layer 3 = Fire+Police combined). Feeds Community Access score. */
  firePoliceStations: `${ARCGIS_BASE}/Story_Map___Live__1__WFL1/FeatureServer/3`,

  /** Parks and trails. Feeds Community Access score. */
  parksAndTrail: `${ARCGIS_BASE}/Park_and_Trail/FeatureServer`,

  /** Community centers. Feeds Community Access score. */
  communityCenters: `${ARCGIS_BASE}/Community_Center/FeatureServer/1`,

  /** Education facilities. Feeds Community Access score. */
  educationFacilities: `${ARCGIS_BASE}/Education_Facility/FeatureServer`,

  /** Pharmacy locations. Feeds Community Access score. */
  pharmacyLocator: `${ARCGIS_BASE}/Pharmacy_Locator/FeatureServer`,

  /** Tornado shelters. Feeds Community Access score. */
  tornadoShelters: `${ARCGIS_BASE}/Tornado_Shelter/FeatureServer`,

  // ─── Geographic Boundaries ────────────────────────────
  /** Council district boundary polygons (2024). Geographic unit for scoring. */
  councilDistricts2024: `${ARCGIS_BASE}/Council_District_2024/FeatureServer`,

  /** City limit boundary. */
  cityLimit: `${ARCGIS_BASE}/City_Limit/FeatureServer`,

  // ─── Bonus / Context Data ─────────────────────────────
  /** Food inspection scores. */
  foodScores: `${ARCGIS_BASE}/Food_Scoring/FeatureServer`,

  /** Infrastructure improvement projects. */
  infrastructureProjects: `${ARCGIS_BASE}/INFRASTRUCTURE_IMPROVEMENT_PROJECTS/FeatureServer`,

  /** Neighborhood association grant data 2021-2025. */
  neighborhoodGrants: `${ARCGIS_BASE}/Neighborhood_Association_Grants/FeatureServer`,

  /** 911 call aggregates (monthly, by category). */
  calls911: `${ARCGIS_BASE}/911_Calls_Data/FeatureServer`,
} as const;

/**
 * Build an ArcGIS REST API query URL.
 * @param endpoint - Base FeatureServer/MapServer URL
 * @param params - Query parameters
 * @returns Full query URL
 */
export function buildQueryUrl(
  endpoint: string,
  params: {
    where?: string;
    outFields?: string;
    returnGeometry?: boolean;
    resultRecordCount?: number;
    orderByFields?: string;
    outSR?: number;
    f?: string;
  } = {}
): string {
  // If the URL already ends with a layer number (e.g. /0, /3), use it as-is.
  // Otherwise append the default layer /0.
  const layerUrl = /\/\d+$/.test(endpoint) ? endpoint : `${endpoint}/0`;
  const queryParams = new URLSearchParams({
    where: params.where || "1=1",
    outFields: params.outFields || "*",
    returnGeometry: String(params.returnGeometry ?? true),
    outSR: String(params.outSR ?? 4326),
    f: params.f || "json",
    ...(params.resultRecordCount
      ? { resultRecordCount: String(params.resultRecordCount) }
      : {}),
    ...(params.orderByFields
      ? { orderByFields: params.orderByFields }
      : {}),
  });
  return `${layerUrl}/query?${queryParams.toString()}`;
}
