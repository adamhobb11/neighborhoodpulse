/**
 * CrimeMapping.com scraper via Bright Data Web Unlocker
 *
 * Montgomery AL crime data is served by CrimeMapping.com (Motorola Solutions).
 * CrimeMapping blocks direct server-to-server requests, so we route through
 * Bright Data's Web Unlocker to bypass bot-detection.
 *
 * Strategy:
 *   1. POST to CrimeMapping JSON API via Bright Data (preferred — returns lat/lon)
 *   2. GET the HTML report page via Bright Data (fallback — parse table)
 *
 * Data: ~663 incidents per 28-day window
 * Fields: IncidentType, IncidentDate, Address, Latitude, Longitude, CaseNumber
 */

import { CrimeIncident, classifySeverity } from "./types";

/** Montgomery PD agency GUID on CrimeMapping.com */
const MONTGOMERY_AGENCY_GUID = "d57e5c5b-8bf3-4dd4-99a5-9ff98a740e30";

const CRIMEMAPPING_API    = "https://www.crimemapping.com/map/GetIncidents";
const CRIMEMAPPING_REPORT = `https://www.crimemapping.com/map/${MONTGOMERY_AGENCY_GUID}`;

/** Resolve the base URL for internal API calls (works on Vercel + localhost). */
function getBaseUrl(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
}

/** Fetch via the Bright Data proxy. Supports GET (default) and POST. */
async function fetchViaBrightData(
  url: string,
  options?: { method?: "POST"; body?: string }
): Promise<string> {
  const res = await fetch(`${getBaseUrl()}/api/brightdata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      method: options?.method || "GET",
      body: options?.body,
      format: "raw",
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`Bright Data proxy: ${err.error || res.statusText}`);
  }

  const data = await res.json();
  return data.content as string;
}

// ─── Strategy 1: JSON API ─────────────────────────────────────────────────────

interface CrimeMapApiIncident {
  IncidentType?: string;
  IncidentDate?: string;
  Address?: string;
  Latitude?: number;
  Longitude?: number;
  CaseNumber?: string;
  Agency?: string;
  [key: string]: unknown;
}

async function fetchViaJsonApi(): Promise<CrimeIncident[]> {
  const endDate   = new Date();
  const startDate = new Date(endDate.getTime() - 28 * 24 * 60 * 60 * 1000);

  const payload = JSON.stringify({
    agencyGuid:    MONTGOMERY_AGENCY_GUID,
    startDate:     startDate.toISOString(),
    endDate:       endDate.toISOString(),
    incidentTypes: [],
  });

  const raw = await fetchViaBrightData(CRIMEMAPPING_API, {
    method: "POST",
    body: payload,
  });

  // Response might be wrapped in JSON
  let parsed: CrimeMapApiIncident[] | { d?: CrimeMapApiIncident[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("CrimeMapping API returned non-JSON");
  }

  const records: CrimeMapApiIncident[] = Array.isArray(parsed)
    ? parsed
    : (parsed as { d?: CrimeMapApiIncident[] }).d ?? [];

  return records
    .filter((r) => r.IncidentType)
    .map((r): CrimeIncident => ({
      type:        r.IncidentType!,
      description: "",
      incidentId:  r.CaseNumber || "",
      address:     r.Address    || "",
      date:        r.IncidentDate ? new Date(r.IncidentDate).toISOString() : new Date().toISOString(),
      severity:    classifySeverity(r.IncidentType!),
      // Pass coordinates through for district assignment
      ...(r.Latitude  != null && { lat: r.Latitude  }),
      ...(r.Longitude != null && { lng: r.Longitude }),
    })) as CrimeIncident[];
}

// ─── Strategy 2: HTML Report Fallback ────────────────────────────────────────

function parseCrimeHtml(html: string): CrimeIncident[] {
  const incidents: CrimeIncident[] = [];
  const stripTags = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();

  // Parse HTML table rows: [Type, Description, Incident#, Location, Agency, Date]
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let row: RegExpExecArray | null;
  while ((row = rowRe.exec(html)) !== null) {
    const cells: string[] = [];
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cell: RegExpExecArray | null;
    while ((cell = cellRe.exec(row[1])) !== null) {
      cells.push(stripTags(cell[1]));
    }
    if (cells.length >= 4) {
      const [type, description, incidentId, address, , dateStr] = cells;
      if (type && type.length > 2 && type.length < 80 && !/^(Type|Crime|Category)/i.test(type)) {
        incidents.push({
          type, description: description || "", incidentId: incidentId || "",
          address: address || "",
          date:    dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(),
          severity: classifySeverity(type),
        });
      }
    }
  }
  return incidents;
}

async function fetchViaHtmlReport(): Promise<CrimeIncident[]> {
  const html = await fetchViaBrightData(CRIMEMAPPING_REPORT);
  return parseCrimeHtml(html);
}

// ─── Main export ─────────────────────────────────────────────────────────────

export interface ScrapeResult {
  incidents: CrimeIncident[];
  source: string;
  error?: string;
}

/**
 * Scrape Montgomery crime data via Bright Data Web Unlocker.
 *
 * Tries the CrimeMapping JSON API first (returns structured data with coordinates),
 * then falls back to parsing the HTML report page.
 */
export async function scrapeCrimeData(): Promise<ScrapeResult> {
  // Strategy 1: JSON API via Bright Data POST
  try {
    const incidents = await fetchViaJsonApi();
    if (incidents.length > 0) {
      return { incidents, source: "brightdata-json-api" };
    }
  } catch (e) {
    console.warn("CrimeMapping JSON API attempt failed:", e);
  }

  // Strategy 2: HTML report page via Bright Data GET
  try {
    const incidents = await fetchViaHtmlReport();
    if (incidents.length > 0) {
      return { incidents, source: "brightdata-html-report" };
    }
  } catch (e) {
    console.warn("CrimeMapping HTML report attempt failed:", e);
  }

  return {
    incidents: [],
    source: "none",
    error:
      "CrimeMapping.com scrape unavailable — zone may need configuration. " +
      "Set BRIGHTDATA_ZONE in environment to your exact zone name from the Bright Data dashboard.",
  };
}
