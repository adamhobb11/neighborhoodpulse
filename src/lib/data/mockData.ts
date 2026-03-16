/**
 * Mock Data — Montgomery Council Districts
 *
 * Realistic simulated data based on Montgomery's actual geographic and
 * demographic structure. Used as fallback when ArcGIS APIs are unreachable.
 * Replace with live API data in production via the arcgis.ts client.
 */

import type { District, DistrictRawData, DistrictData } from "./types";
import { calculateDistrictScores } from "../scoring/engine";

export const DISTRICTS: District[] = [
  { id: 1, name: "District 1", area: "Dalraida / East Montgomery", population: 26400, center: [32.395, -86.235] },
  { id: 2, name: "District 2", area: "Cloverdale / Garden District", population: 25800, center: [32.365, -86.310] },
  { id: 3, name: "District 3", area: "Capitol Heights / Midtown", population: 27100, center: [32.380, -86.305] },
  { id: 4, name: "District 4", area: "West Montgomery / Chisholm", population: 24900, center: [32.365, -86.355] },
  { id: 5, name: "District 5", area: "Mobile Highway / SW Montgomery", population: 25200, center: [32.335, -86.360] },
  { id: 6, name: "District 6", area: "North Montgomery / Normandale", population: 23800, center: [32.410, -86.310] },
  { id: 7, name: "District 7", area: "South Montgomery / Gibbs Village", population: 24500, center: [32.340, -86.290] },
  { id: 8, name: "District 8", area: "East Chase / Taylor Rd Corridor", population: 28200, center: [32.370, -86.170] },
  { id: 9, name: "District 9", area: "Pike Road / SE Montgomery", population: 27500, center: [32.320, -86.220] },
];

/** Simulated raw data per district — structured to match real ArcGIS field aggregations */
export const MOCK_RAW_DATA: Record<number, DistrictRawData> = {
  1: {
    fireResponseCount90d: 89, fireResponseCountPrev90d: 102, nuisanceCount90d: 14,
    violentCrimes90d: 18, violentCrimesPrev90d: 22, propertyCrimes90d: 45, propertyCrimesPrev90d: 48, minorOffenses90d: 31, minorOffensesPrev90d: 28,
    permits180d: 34, permitsNewConstruction: 8, bizLicensesActive: 145, bizLicensesNew: 12,
    permits180dPrev: 30, permitsNewConstructionPrev: 7, bizLicensesNewPrev: 10,
    requests311Total: 72, requests311Resolved: 61, avgResolutionDays: 7.5,
    requests311TotalPrev: 82, requests311ResolvedPrev: 65, avgResolutionDaysPrev: 9.1,
    codeViolationsOpen: 23, codeViolationsClosedRate: 0.62,
    codeViolationsOpenPrev: 19, codeViolationsClosedRatePrev: 0.58,
    fireStations: 1, policeStations: 1, parks: 4, communityCenters: 1, schools: 5, pharmacies: 3, shelters: 1,
    priorOverallScore: 68,
  },
  2: {
    fireResponseCount90d: 52, fireResponseCountPrev90d: 55, nuisanceCount90d: 6,
    violentCrimes90d: 8, violentCrimesPrev90d: 10, propertyCrimes90d: 22, propertyCrimesPrev90d: 25, minorOffenses90d: 18, minorOffensesPrev90d: 16,
    permits180d: 48, permitsNewConstruction: 14, bizLicensesActive: 210, bizLicensesNew: 18,
    permits180dPrev: 44, permitsNewConstructionPrev: 11, bizLicensesNewPrev: 15,
    requests311Total: 38, requests311Resolved: 35, avgResolutionDays: 3.8,
    requests311TotalPrev: 41, requests311ResolvedPrev: 38, avgResolutionDaysPrev: 4.8,
    codeViolationsOpen: 11, codeViolationsClosedRate: 0.78,
    codeViolationsOpenPrev: 14, codeViolationsClosedRatePrev: 0.72,
    fireStations: 1, policeStations: 1, parks: 6, communityCenters: 2, schools: 4, pharmacies: 4, shelters: 1,
    priorOverallScore: 75,
  },
  3: {
    fireResponseCount90d: 134, fireResponseCountPrev90d: 140, nuisanceCount90d: 22,
    violentCrimes90d: 34, violentCrimesPrev90d: 30, propertyCrimes90d: 68, propertyCrimesPrev90d: 62, minorOffenses90d: 42, minorOffensesPrev90d: 38,
    permits180d: 41, permitsNewConstruction: 11, bizLicensesActive: 178, bizLicensesNew: 15,
    permits180dPrev: 45, permitsNewConstructionPrev: 13, bizLicensesNewPrev: 18,
    requests311Total: 142, requests311Resolved: 88, avgResolutionDays: 14.2,
    requests311TotalPrev: 124, requests311ResolvedPrev: 78, avgResolutionDaysPrev: 12.8,
    codeViolationsOpen: 38, codeViolationsClosedRate: 0.45,
    codeViolationsOpenPrev: 32, codeViolationsClosedRatePrev: 0.49,
    fireStations: 2, policeStations: 1, parks: 3, communityCenters: 1, schools: 6, pharmacies: 3, shelters: 1,
    priorOverallScore: 63,
  },
  4: {
    fireResponseCount90d: 168, fireResponseCountPrev90d: 148, nuisanceCount90d: 35,
    violentCrimes90d: 52, violentCrimesPrev90d: 44, propertyCrimes90d: 89, propertyCrimesPrev90d: 76, minorOffenses90d: 58, minorOffensesPrev90d: 48,
    permits180d: 18, permitsNewConstruction: 3, bizLicensesActive: 87, bizLicensesNew: 5,
    permits180dPrev: 22, permitsNewConstructionPrev: 5, bizLicensesNewPrev: 7,
    requests311Total: 198, requests311Resolved: 84, avgResolutionDays: 22.5,
    requests311TotalPrev: 162, requests311ResolvedPrev: 92, avgResolutionDaysPrev: 18.2,
    codeViolationsOpen: 67, codeViolationsClosedRate: 0.31,
    codeViolationsOpenPrev: 56, codeViolationsClosedRatePrev: 0.36,
    fireStations: 1, policeStations: 0, parks: 2, communityCenters: 0, schools: 3, pharmacies: 1, shelters: 0,
    priorOverallScore: 64,
  },
  5: {
    fireResponseCount90d: 145, fireResponseCountPrev90d: 130, nuisanceCount90d: 28,
    violentCrimes90d: 41, violentCrimesPrev90d: 36, propertyCrimes90d: 72, propertyCrimesPrev90d: 65, minorOffenses90d: 47, minorOffensesPrev90d: 42,
    permits180d: 22, permitsNewConstruction: 4, bizLicensesActive: 95, bizLicensesNew: 7,
    permits180dPrev: 26, permitsNewConstructionPrev: 5, bizLicensesNewPrev: 9,
    requests311Total: 165, requests311Resolved: 78, avgResolutionDays: 19.8,
    requests311TotalPrev: 138, requests311ResolvedPrev: 82, avgResolutionDaysPrev: 16.8,
    codeViolationsOpen: 52, codeViolationsClosedRate: 0.38,
    codeViolationsOpenPrev: 48, codeViolationsClosedRatePrev: 0.42,
    fireStations: 1, policeStations: 0, parks: 2, communityCenters: 0, schools: 4, pharmacies: 2, shelters: 0,
    priorOverallScore: 66,
  },
  6: {
    fireResponseCount90d: 112, fireResponseCountPrev90d: 128, nuisanceCount90d: 18,
    violentCrimes90d: 28, violentCrimesPrev90d: 32, propertyCrimes90d: 52, propertyCrimesPrev90d: 58, minorOffenses90d: 35, minorOffensesPrev90d: 38,
    permits180d: 27, permitsNewConstruction: 6, bizLicensesActive: 112, bizLicensesNew: 9,
    permits180dPrev: 22, permitsNewConstructionPrev: 4, bizLicensesNewPrev: 7,
    requests311Total: 108, requests311Resolved: 72, avgResolutionDays: 12.1,
    requests311TotalPrev: 112, requests311ResolvedPrev: 72, avgResolutionDaysPrev: 13.5,
    codeViolationsOpen: 34, codeViolationsClosedRate: 0.52,
    codeViolationsOpenPrev: 38, codeViolationsClosedRatePrev: 0.48,
    fireStations: 1, policeStations: 1, parks: 3, communityCenters: 1, schools: 4, pharmacies: 2, shelters: 1,
    priorOverallScore: 65,
  },
  7: {
    fireResponseCount90d: 98, fireResponseCountPrev90d: 105, nuisanceCount90d: 20,
    violentCrimes90d: 24, violentCrimesPrev90d: 26, propertyCrimes90d: 48, propertyCrimesPrev90d: 52, minorOffenses90d: 32, minorOffensesPrev90d: 30,
    permits180d: 19, permitsNewConstruction: 5, bizLicensesActive: 78, bizLicensesNew: 6,
    permits180dPrev: 23, permitsNewConstructionPrev: 7, bizLicensesNewPrev: 8,
    requests311Total: 128, requests311Resolved: 82, avgResolutionDays: 15.4,
    requests311TotalPrev: 109, requests311ResolvedPrev: 74, avgResolutionDaysPrev: 14.1,
    codeViolationsOpen: 41, codeViolationsClosedRate: 0.44,
    codeViolationsOpenPrev: 36, codeViolationsClosedRatePrev: 0.47,
    fireStations: 1, policeStations: 0, parks: 2, communityCenters: 1, schools: 3, pharmacies: 2, shelters: 0,
    priorOverallScore: 58,
  },
  8: {
    fireResponseCount90d: 42, fireResponseCountPrev90d: 48, nuisanceCount90d: 4,
    violentCrimes90d: 6, violentCrimesPrev90d: 8, propertyCrimes90d: 18, propertyCrimesPrev90d: 20, minorOffenses90d: 12, minorOffensesPrev90d: 14,
    permits180d: 56, permitsNewConstruction: 19, bizLicensesActive: 245, bizLicensesNew: 22,
    permits180dPrev: 49, permitsNewConstructionPrev: 15, bizLicensesNewPrev: 18,
    requests311Total: 32, requests311Resolved: 31, avgResolutionDays: 2.9,
    requests311TotalPrev: 42, requests311ResolvedPrev: 38, avgResolutionDaysPrev: 4.6,
    codeViolationsOpen: 8, codeViolationsClosedRate: 0.85,
    codeViolationsOpenPrev: 11, codeViolationsClosedRatePrev: 0.79,
    fireStations: 1, policeStations: 1, parks: 5, communityCenters: 2, schools: 6, pharmacies: 5, shelters: 1,
    priorOverallScore: 72,
  },
  9: {
    fireResponseCount90d: 58, fireResponseCountPrev90d: 64, nuisanceCount90d: 7,
    violentCrimes90d: 10, violentCrimesPrev90d: 12, propertyCrimes90d: 28, propertyCrimesPrev90d: 30, minorOffenses90d: 19, minorOffensesPrev90d: 21,
    permits180d: 44, permitsNewConstruction: 15, bizLicensesActive: 188, bizLicensesNew: 16,
    permits180dPrev: 40, permitsNewConstructionPrev: 12, bizLicensesNewPrev: 14,
    requests311Total: 48, requests311Resolved: 44, avgResolutionDays: 5.2,
    requests311TotalPrev: 52, requests311ResolvedPrev: 45, avgResolutionDaysPrev: 6.8,
    codeViolationsOpen: 14, codeViolationsClosedRate: 0.72,
    codeViolationsOpenPrev: 18, codeViolationsClosedRatePrev: 0.68,
    fireStations: 1, policeStations: 1, parks: 4, communityCenters: 1, schools: 5, pharmacies: 3, shelters: 1,
    priorOverallScore: 71,
  },
};

/**
 * Generate scored district data from mock raw data.
 * This is the fallback used when live ArcGIS APIs are unreachable.
 */
export function getMockDistrictData(): DistrictData[] {
  return DISTRICTS.map((district) => {
    const raw = MOCK_RAW_DATA[district.id];
    const scores = calculateDistrictScores(raw, district.population);
    return { district, scores, raw };
  });
}
