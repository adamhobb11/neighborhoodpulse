/**
 * Types for Montgomery Open Data — NeighborhoodPulse
 */

// ─── ArcGIS Response Types ─────────────────────────────

export interface ArcGISResponse<T = Record<string, unknown>> {
  features: ArcGISFeature<T>[];
  exceededTransferLimit?: boolean;
}

export interface ArcGISFeature<T = Record<string, unknown>> {
  attributes: T;
  geometry?: {
    x: number;
    y: number;
    rings?: number[][][];
  };
}

// ─── District Types ─────────────────────────────────────

export interface District {
  id: number;
  name: string;
  area: string;
  population: number;
  center: [number, number]; // [lat, lng]
  boundary?: number[][][]; // GeoJSON-style polygon rings
}

// ─── Raw Data Types (from ArcGIS) ───────────────────────

export interface ConstructionPermit {
  OBJECTID: number;
  PermitNo?: string;
  IssuedDate?: string | number; // ISO date string e.g. "2025-03-10"
  PermitStatus?: string;
  PermitCode?: string;
  ProjectType?: string; // "New" | "Renovation" | etc.
  UseType?: string;
  EstimatedCost?: number;
  DistrictCouncil?: number; // integer district id
  Address?: string;
  PhysicalAddress?: string;
  [key: string]: unknown;
}

export interface BusinessLicenseRecord {
  OBJECTID: number;
  custCOMPANY_NAME?: string;
  pvEFFDATE?: string | number; // ISO date "2021-01-01" — license start
  pvEXPIRE?: string | number;  // ISO date "2021-12-31" — license expiry
  pvrtDESC?: string; // "Renew" | "New" | etc.
  scNAME?: string;   // business category
  CITY?: string;     // "YES" = City of Montgomery, "NO" = county
  Full_Address?: string;
  [key: string]: unknown;
}

export interface ServiceRequest311 {
  OBJECTID: number;
  Request_ID?: number;
  Request_Type?: string;
  Status?: string;   // "Closed" | "Open" | "In Progress"
  Create_Date?: number; // epoch ms
  Close_Date?: number;  // epoch ms
  Department?: string;
  District?: number;    // integer district id (1–9)
  Address?: string;
  [key: string]: unknown;
}

export interface CodeViolation {
  OBJECTID: number;
  OffenceNum?: string;
  CaseDate?: string | number; // ISO date "2021-10-27"
  CaseType?: string;
  CaseStatus?: string; // "OPEN" | "CLOSED" | etc.
  LienStatus?: string;
  CouncilDistrict?: string; // "DISTRICT 4" — parse to int
  Address1?: string;
  [key: string]: unknown;
}

export interface FireResponse {
  OBJECTID: number;
  Incident_Number?: string;
  Incident_Type?: string;
  Heading?: string;    // category heading
  Alarm_Date_Time?: number; // epoch ms
  District?: number;        // integer district id
  Station?: string;
  Lattitude?: number;  // note: intentionally misspelled in source data
  Longitude?: number;
  [key: string]: unknown;
}

export interface EnvironmentalNuisance {
  OBJECTID: number;
  Offense_No?: string;
  Type?: string;
  Address?: string;
  Source_Date?: number; // epoch ms
  Remarks?: string;
  // No district field — requires point-in-polygon via geometry
  [key: string]: unknown;
}

// ─── Score Types ────────────────────────────────────────

export interface ComponentScores {
  safety: number;
  economic: number;
  services: number;
  code: number;
  community: number;
}

export interface DistrictScores extends ComponentScores {
  overall: number;
  trend: number; // percentage change in primary safety metric
  trends: ComponentScores; // per-component score direction (positive = improving)
  label: "Thriving" | "Stable" | "Watch" | "At Risk" | "Critical";
}

export interface DistrictRawData {
  // Safety — Fire/EMS
  fireResponseCount90d: number;
  fireResponseCountPrev90d: number;
  nuisanceCount90d: number;

  // Safety — Crime (from CrimeMapping.com via Bright Data)
  violentCrimes90d: number;       // homicide, aggravated assault, robbery (weighted 3×)
  violentCrimesPrev90d: number;
  propertyCrimes90d: number;      // burglary, auto theft, larceny (weighted 2×)
  propertyCrimesPrev90d: number;
  minorOffenses90d: number;       // misdemeanor, disorderly conduct (weighted 1×)
  minorOffensesPrev90d: number;

  // Economic
  permits180d: number;
  permitsNewConstruction: number;
  bizLicensesActive: number;
  bizLicensesNew: number;

  // Economic — prior period for trend
  permits180dPrev: number;
  permitsNewConstructionPrev: number;
  bizLicensesNewPrev: number;

  // City Services
  requests311Total: number;
  requests311Resolved: number;
  avgResolutionDays: number;

  // City Services — prior period for trend
  requests311TotalPrev: number;
  requests311ResolvedPrev: number;
  avgResolutionDaysPrev: number;

  // Code Compliance
  codeViolationsOpen: number;
  codeViolationsClosedRate: number;

  // Code Compliance — prior period for trend
  codeViolationsOpenPrev: number;
  codeViolationsClosedRatePrev: number;

  // Community Access
  fireStations: number;
  policeStations: number;
  parks: number;
  communityCenters: number;
  schools: number;
  pharmacies: number;
  shelters: number;

  // Prior quarter overall health score (for trend display)
  priorOverallScore: number;
}

export interface DistrictData {
  district: District;
  scores: DistrictScores;
  raw: DistrictRawData;
}

// ─── AI Briefing Types ──────────────────────────────────

export interface AIBriefing {
  summary: string;
  recommendation: string;
  actions?: string[];
  alert: string | null;
}
