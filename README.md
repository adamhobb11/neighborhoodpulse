# NeighborhoodPulse

**Community Health Intelligence Dashboard — Montgomery, Alabama**

> Real-time Neighborhood Health Index for all 9 council districts, powered by Montgomery's Open Data Portal.
> **Challenge Stream:** Public Safety, Emergency Response & City Analytics — GenAI Works Hackathon

**Live Demo:** https://neighborhoodpulse.vercel.app

---

## What It Does

NeighborhoodPulse computes a **Neighborhood Health Index (0–100)** for each of Montgomery's 9 council districts by aggregating five data dimensions from the city's [ArcGIS Open Data Portal](https://opendata.montgomeryal.gov):

| Component | Weight | Data Source | Update Frequency |
|---|---|---|---|
| Public Safety | 25% | Fire/EMS Responses, Environmental Nuisance | Weekly |
| Economic Vitality | 20% | Construction Permits (180d), Active Business Licenses | Weekly |
| City Services | 20% | 311 Service Requests — resolution rate & speed | Continuous |
| Code Compliance | 20% | Code Violations — open count & closure rate | Daily |
| Community Access | 15% | Parks, Fire/Police Stations, Community Centers, Schools, Pharmacies, Shelters | Monthly |

**Score Labels:** 75–100 Thriving · 60–74 Stable · 45–59 Watch · 30–44 At Risk · 0–29 Critical

**Target Users:** City council members, department heads, Office of Violence Prevention

---

## How It Works

1. On each dashboard load, `/api/scores` fetches live data from 11 ArcGIS FeatureServer endpoints in parallel
2. Features without a district ID are assigned to districts via **point-in-polygon** using the Council District 2024 boundary polygons
3. Raw counts are aggregated per district and fed into the **rolling-baseline scoring engine** (districts scored against the city's own range — immune to macro conditions)
4. The UI renders a Leaflet map with color-coded score markers and a ranked district list
5. Clicking a district generates an **AI briefing** via the Claude API (falls back to local generation without an API key)

Falls back to mock data if ArcGIS APIs are unreachable — the demo always works.

---

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── scores/route.ts      # Live ArcGIS fetch + scoring pipeline
│   │   ├── briefing/route.ts    # Claude AI briefing generation
│   │   ├── brightdata/route.ts  # Bright Data proxy (server-side, key secured)
│   │   └── crimes/route.ts      # CrimeMapping.com scraper via Bright Data
│   ├── page.tsx                 # Dashboard UI (map, ranking, detail panel)
│   ├── layout.tsx               # Root layout + fonts
│   └── globals.css              # Dark theme styles
└── lib/
    ├── data/
    │   ├── endpoints.ts         # All ArcGIS REST API URLs (Montgomery org)
    │   ├── arcgis.ts            # Typed ArcGIS fetch client
    │   ├── aggregate.ts         # Point-in-polygon district assignment + aggregation
    │   ├── mockData.ts          # Fallback data (9 districts)
    │   └── types.ts             # TypeScript interfaces (real ArcGIS field names)
    ├── scoring/
    │   ├── engine.ts            # Health index algorithm (documented)
    │   └── briefing.ts          # AI briefing — Claude API + local fallback
    └── brightdata/
        ├── types.ts             # CrimeIncident types + severity classifier
        └── scraper.ts           # CrimeMapping.com scraper (JSON API + HTML fallback)
```

---

## Data Sources

All data from Montgomery's ArcGIS organization (`xNUwUjOJqYE54USz`):

| Dataset | Endpoint | District Field |
|---|---|---|
| Construction Permits | `gis.montgomeryal.gov/.../Construction_Permits/FeatureServer/0` | `DistrictCouncil` (int) |
| Business Licenses | `gis.montgomeryal.gov/.../Business_License/FeatureServer/0` | Point geometry → spatial join |
| 311 Service Requests | `gis.montgomeryal.gov/.../Received_311_Service_Request/MapServer/0` | `District` (int) |
| Code Violations | `gis.montgomeryal.gov/.../Code_Violations/FeatureServer/0` | `CouncilDistrict` ("DISTRICT N") |
| Fire/EMS Responses | `services7.arcgis.com/.../Fire_Responses_view/FeatureServer/0` | `District` (int) |
| Environmental Nuisance | `services7.arcgis.com/.../Environmental_Nuisance/FeatureServer/0` | Point geometry → spatial join |
| Council Districts 2024 | `services7.arcgis.com/.../Council_District_2024/FeatureServer/0` | Reference polygons |
| Fire + Police Stations | `services7.arcgis.com/.../Story_Map___Live__1__WFL1/FeatureServer/3` | Point geometry → spatial join |
| Parks & Trails | `services7.arcgis.com/.../Park_and_Trail/FeatureServer/0` | Point geometry → spatial join |
| Education Facilities | `services7.arcgis.com/.../Education_Facility/FeatureServer/0` | Point geometry → spatial join |
| Pharmacies | `services7.arcgis.com/.../Pharmacy_Locator/FeatureServer/0` | Point geometry → spatial join |
| Tornado Shelters | `services7.arcgis.com/.../Tornado_Shelter/FeatureServer/0` | Point geometry → spatial join |

**Known data freshness note:** The Fire/EMS Responses dataset was last updated May 2022. The dashboard fetches the 2000 most recent records (split 50/50 for trend) to provide valid district-to-district safety comparisons. All other datasets are updated regularly.

---

## Scoring Methodology

See [`src/lib/scoring/engine.ts`](src/lib/scoring/engine.ts) for the fully documented algorithm.

**Normalization:** Rolling baseline — each component is normalized against the city's own min/max range, so scores are relative to Montgomery's current conditions rather than absolute benchmarks. This automatically adjusts for macroeconomic shifts.

**Point-in-polygon:** For datasets without a pre-computed district field, features are assigned to districts using a ray-casting algorithm against the Council District 2024 boundary polygons (see [`src/lib/data/aggregate.ts`](src/lib/data/aggregate.ts)).

---

## Bright Data Integration

Crime incident data from [CrimeMapping.com](https://www.crimemapping.com) (Motorola Solutions) is not available via a public ArcGIS endpoint. CrimeMapping uses bot-detection; we route requests through **Bright Data Web Unlocker** to bypass it.

Architecture:
- `POST /api/brightdata` — server-side proxy, API key never exposed to the browser
- Scraper tries the CrimeMapping JSON API first (`POST /map/GetIncidents` with Montgomery's agency GUID), falls back to HTML report parsing
- JSON API response includes `Latitude`/`Longitude`, enabling point-in-polygon district assignment
- Crime incidents are severity-weighted: violent (3×), property (2×), minor (1×)

Requires a Bright Data **residential proxy** zone to fully bypass CrimeMapping's bot protection. See `BRIGHTDATA_ZONE` in environment variables.

---

## Local Setup

```bash
npm install
npm run dev
# Open http://localhost:3000
```

### Environment Variables

```env
# Optional — enables AI district briefings via Claude API
ANTHROPIC_API_KEY=your_key

# Optional — enables CrimeMapping.com scraping via Bright Data
BRIGHTDATA_API_KEY=your_key
BRIGHTDATA_ZONE=your_zone_name   # e.g. web_unlocker1 (residential zone recommended)
```

Without these keys, the dashboard still works fully — AI briefings use local generation, crime data falls back to fire/EMS proxy indicators.

---

## Tech Stack

- **Next.js 16** (App Router, TypeScript)
- **Tailwind CSS v4** — dark theme
- **Leaflet.js** — map with CartoDB dark tiles (no API key required)
- **ArcGIS REST API** — Montgomery's Open Data Portal
- **Anthropic Claude API** (`claude-sonnet-4-6`) — AI district briefings
- **Bright Data Web Unlocker** — CrimeMapping.com scraping

## License

MIT
