/**
 * AI Briefing Generator
 *
 * Produces natural language insights for each council district.
 * In production, this calls the Claude API for richer analysis.
 * The local fallback generates deterministic briefings from score data.
 */

import type { District, DistrictScores, DistrictRawData, AIBriefing, ComponentScores } from "../data/types";

const COMPONENT_LABELS: Record<keyof ComponentScores, string> = {
  safety: "Public Safety",
  economic: "Economic Vitality",
  services: "City Services Responsiveness",
  code: "Code Compliance",
  community: "Community Resource Access",
};

/**
 * Generate a briefing for a district using local logic.
 * This is the fallback when Claude API is not configured.
 */
export function generateLocalBriefing(
  district: District,
  scores: DistrictScores,
  raw: DistrictRawData
): AIBriefing {
  const { safety, economic, services, code, community, overall } = scores;

  // Find weakest and strongest components
  const components: [keyof ComponentScores, number][] = [
    ["safety", safety],
    ["economic", economic],
    ["services", services],
    ["code", code],
    ["community", community],
  ];
  components.sort((a, b) => a[1] - b[1]);
  const weakest = components[0];
  const strongest = components[components.length - 1];

  // Trend analysis
  const trend = scores.trend;
  const trendPct = Math.abs(trend * 100).toFixed(1);
  const trendDir = trend < 0 ? "declined" : "increased";

  // Summary
  const summary = `${district.name} (${district.area}) has an overall health index of ${overall}/100, classified as "${scores.label}." The strongest dimension is ${COMPONENT_LABELS[strongest[0]]} at ${strongest[1]}/100, while ${COMPONENT_LABELS[weakest[0]]} is the primary area of concern at ${weakest[1]}/100. Fire/EMS incidents ${trendDir} ${trendPct}% compared to the prior quarter.`;

  // Context-specific recommendation based on weakest component
  const recommendations: Record<keyof ComponentScores, string> = {
    safety: `Fire/EMS responses are at ${raw.fireResponseCount90d} incidents over 90 days with ${raw.nuisanceCount90d} environmental nuisance reports. ${
      trend > 0
        ? "The upward trend suggests deteriorating conditions."
        : "The declining trend is positive but continued monitoring is warranted."
    } Recommend coordinating with the Office of Violence Prevention and Montgomery Fire/Rescue for targeted intervention in high-incident areas within this district.`,

    economic: `Only ${raw.permits180d} construction permits were issued in 180 days (${raw.permitsNewConstruction} new construction). ${raw.bizLicensesNew} new business licenses issued. This district may benefit from targeted Access Montgomery outreach and S.E.E.D. Grant promotion to stimulate economic activity.`,

    services: `311 resolution rate is ${raw.requests311Total > 0 ? ((raw.requests311Resolved / raw.requests311Total) * 100).toFixed(0) : 0}% with an average resolution time of ${raw.avgResolutionDays} days. ${raw.requests311Total - raw.requests311Resolved} requests remain open. Recommend reviewing Neighborhood Services staffing allocation for this district.`,

    code: `${raw.codeViolationsOpen} open code violations with a ${(raw.codeViolationsClosedRate * 100).toFixed(0)}% closure rate. Unresolved violations correlate with visible neighborhood deterioration. Recommend prioritizing code enforcement resources in this district, particularly in areas with concentrated violations.`,

    community: `Limited community infrastructure: ${raw.parks} parks, ${raw.communityCenters} community centers, ${raw.fireStations + raw.policeStations} emergency service facilities, ${raw.schools} schools. ${
      raw.communityCenters === 0
        ? "The absence of a community center is a significant gap."
        : ""
    } Consider investment in community resource access per Envision Montgomery 2040 equity goals.`,
  };

  // Alert for critical districts
  let alert: string | null = null;
  if (overall < 40) {
    alert =
      "⚠ PRIORITY ALERT: Multiple indicators below threshold. This district requires immediate cross-departmental attention.";
  } else if (overall < 55) {
    const belowAvg = components.filter(([, score]) => score < 50);
    if (belowAvg.length >= 3) {
      alert =
        "⚠ WATCH: Three or more components scoring below 50. This convergence pattern historically precedes accelerated neighborhood decline. Preventive intervention recommended.";
    }
  }

  // Generate 3 specific action items based on bottom two components
  const actionTemplates: Record<keyof ComponentScores, string[]> = {
    safety: [
      `Request Office of Violence Prevention deployment in ${district.name} for targeted street-level intervention`,
      `Coordinate with Montgomery Fire/Rescue Station to review response coverage gaps in high-incident zones`,
      `Initiate environmental nuisance abatement sweep in coordination with Neighborhood Services`,
    ],
    economic: [
      `Launch targeted Access Montgomery outreach campaign for business owners in ${district.name}`,
      `Promote S.E.E.D. Grant program to eligible small businesses — only ${raw.bizLicensesNew} new licenses issued this period`,
      `Partner with Montgomery Area Chamber to identify barriers to construction permit activity`,
    ],
    services: [
      `Review Neighborhood Services staffing allocation for ${district.name} — ${raw.requests311Total - raw.requests311Resolved} requests unresolved`,
      `Set a 10-day resolution target for 311 requests in this district (currently averaging ${raw.avgResolutionDays} days)`,
      `Conduct quarterly 311 performance review with department heads responsible for this district`,
    ],
    code: [
      `Prioritize code enforcement resources in ${district.name} — ${raw.codeViolationsOpen} violations currently open`,
      `Implement a 90-day closure blitz targeting clusters of unresolved violations per Envision 2040 equity goals`,
      `Coordinate lien enforcement actions for chronically non-compliant properties`,
    ],
    community: [
      `Identify site for community center in ${district.name} — currently ${raw.communityCenters === 0 ? "none" : raw.communityCenters} in district`,
      `Apply for CDBG or Envision Montgomery 2040 equity funding for park improvements in underserved areas`,
      `Evaluate emergency facility coverage gaps: district has ${raw.fireStations + raw.policeStations} emergency service location(s)`,
    ],
  };

  const actions = [
    actionTemplates[weakest[0]][0],
    actionTemplates[components[1][0] as keyof ComponentScores][0],
    actionTemplates[weakest[0]][1],
  ];

  return {
    summary,
    recommendation: recommendations[weakest[0]],
    actions,
    alert,
  };
}

/**
 * Generate a briefing using the Claude API.
 * Falls back to local generation if the API is unavailable.
 *
 * @param apiKey - Anthropic API key (from environment variable)
 */
export async function generateAIBriefing(
  district: District,
  scores: DistrictScores,
  raw: DistrictRawData,
  apiKey?: string
): Promise<AIBriefing> {
  // Fall back to local if no API key
  if (!apiKey) {
    return generateLocalBriefing(district, scores, raw);
  }

  try {
    const prompt = `You are an AI analyst for the City of Montgomery, Alabama's NeighborhoodPulse dashboard. Generate a concise council briefing for ${district.name} (${district.area}).

Health Index: ${scores.overall}/100 (${scores.label})
Component Scores: Safety ${scores.safety}, Economic ${scores.economic}, Services ${scores.services}, Code ${scores.code}, Community ${scores.community}

Raw Data:
- Fire/EMS responses (90d): ${raw.fireResponseCount90d} (prev: ${raw.fireResponseCountPrev90d})
- Environmental nuisances (90d): ${raw.nuisanceCount90d}
- Construction permits (180d): ${raw.permits180d} (${raw.permitsNewConstruction} new construction)
- New business licenses: ${raw.bizLicensesNew}
- 311 requests: ${raw.requests311Total} total, ${raw.requests311Resolved} resolved, avg ${raw.avgResolutionDays} days
- Open code violations: ${raw.codeViolationsOpen} (${(raw.codeViolationsClosedRate * 100).toFixed(0)}% closure rate)
- Community resources: ${raw.parks} parks, ${raw.communityCenters} centers, ${raw.fireStations + raw.policeStations} stations, ${raw.schools} schools

Respond with JSON only (no markdown):
{"summary": "2-3 sentence overview", "recommendation": "specific actionable recommendation tied to Montgomery programs (Office of Violence Prevention, Access Montgomery, S.E.E.D. Grant, Envision 2040)", "actions": ["Action item 1 referencing a specific Montgomery program", "Action item 2 with concrete measurable step", "Action item 3 for medium-term follow-up"], "alert": "null or priority alert string if overall < 45 or multiple components declining"}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error("Claude API error:", response.status);
      return generateLocalBriefing(district, scores, raw);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "";

    // Parse JSON response
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    return {
      summary: parsed.summary || "",
      recommendation: parsed.recommendation || "",
      actions: Array.isArray(parsed.actions) ? parsed.actions : undefined,
      alert: parsed.alert || null,
    };
  } catch (error) {
    console.error("AI briefing generation failed, using local fallback:", error);
    return generateLocalBriefing(district, scores, raw);
  }
}
