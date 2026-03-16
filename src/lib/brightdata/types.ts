/**
 * Bright Data — CrimeMapping.com scraping types
 */

export interface CrimeIncident {
  type: string;         // e.g. "Assault", "Burglary", "Vandalism"
  description: string;
  incidentId: string;
  address: string;
  date: string;         // ISO date string
  severity: "violent" | "property" | "minor";
  lat?: number;         // latitude (from JSON API — enables district assignment)
  lng?: number;         // longitude
}

/** Severity weights for Public Safety scoring */
export const CRIME_SEVERITY_WEIGHTS: Record<CrimeIncident["severity"], number> = {
  violent:  3,
  property: 2,
  minor:    1,
};

/** Crime type → severity mapping based on common categories */
const VIOLENT_KEYWORDS = [
  "assault", "robbery", "homicide", "murder", "rape", "sexual", "battery",
  "shooting", "stabbing", "kidnap", "carjack", "weapon",
];
const PROPERTY_KEYWORDS = [
  "burglary", "theft", "larceny", "auto theft", "vehicle theft", "stolen",
  "vandalism", "arson", "fraud", "embezzlement", "trespass",
];

export function classifySeverity(type: string): CrimeIncident["severity"] {
  const lower = type.toLowerCase();
  if (VIOLENT_KEYWORDS.some((k) => lower.includes(k)))  return "violent";
  if (PROPERTY_KEYWORDS.some((k) => lower.includes(k))) return "property";
  return "minor";
}
