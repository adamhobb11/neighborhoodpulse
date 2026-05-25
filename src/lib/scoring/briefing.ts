/**
 * AI Briefing Generator
 *
 * Produces executive-level council briefings for each district.
 * Tone target: senior municipal strategy advisory — evidence-driven,
 * concise, realistic, and appropriate for city council leadership.
 *
 * In production, calls the Claude API for richer analysis.
 * The local fallback generates deterministic briefings from score data.
 */

import type { District, DistrictScores, DistrictRawData, AIBriefing, ComponentScores } from "../data/types";

const COMPONENT_LABELS: Record<keyof ComponentScores, string> = {
  safety:    "Public Safety",
  economic:  "Economic Vitality",
  services:  "City Services Responsiveness",
  code:      "Code Compliance",
  community: "Community Resource Access",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function perCapita10k(count: number, population: number): string {
  return ((count / Math.max(population, 1)) * 10_000).toFixed(1);
}

function resRate(raw: DistrictRawData): number {
  return raw.requests311Total > 0
    ? Math.round((raw.requests311Resolved / raw.requests311Total) * 100)
    : 0;
}

// ─── Local Fallback ───────────────────────────────────────────────────────────

/**
 * Generate a briefing for a district using local rule-based logic.
 * This is the fallback when the Claude API is not configured.
 *
 * Design principles:
 * - Never surface trends smaller than ±5% (noise, not signal)
 * - Never surface the fire/EMS halfpoint-split trend (not a real period comparison)
 * - Only surface signals that have strategic significance
 * - Recommendations are policy-oriented and operationally realistic
 * - Actions are at the council/manager level — not tactical micro-steps
 */
export function generateLocalBriefing(
  district: District,
  scores: DistrictScores,
  raw: DistrictRawData
): AIBriefing {
  const { safety, economic, services, code, community, overall } = scores;
  const pop = district.population;

  // ── Sort components weakest → strongest ──────────────────────────────────
  const components: [keyof ComponentScores, number][] = [
    ["safety",    safety],
    ["economic",  economic],
    ["services",  services],
    ["code",      code],
    ["community", community],
  ];
  components.sort((a, b) => a[1] - b[1]);

  const [weakest, secondWeakest] = components;
  const strongest = components[components.length - 1];

  const concerning = components.filter(([, s]) => s < 60);
  const critical   = components.filter(([, s]) => s < 45);

  // ── Summary ───────────────────────────────────────────────────────────────
  // Rule: no synthetic trend percentages; only absolute scores and data signals.
  const lead = `${district.name} carries a District Health Index of ${overall}/100, rated ${scores.label}.`;

  let context: string;
  if (concerning.length === 0) {
    context = `All five components score at or above 60, with ${COMPONENT_LABELS[strongest[0]]} leading at ${strongest[1]}/100. No immediate operational concerns are indicated by current data.`;
  } else if (concerning.length === 1) {
    const [key, score] = concerning[0];
    context = `${COMPONENT_LABELS[key]} is the primary area of concern at ${score}/100, while ${COMPONENT_LABELS[strongest[0]]} remains the district's strongest dimension at ${strongest[1]}/100.`;
  } else if (concerning.length >= 3) {
    context = `${concerning.length} of 5 components score below 60 — ${COMPONENT_LABELS[weakest[0]]} (${weakest[1]}) and ${COMPONENT_LABELS[secondWeakest[0]]} (${secondWeakest[1]}) are the most significant gaps — indicating a convergence of pressures that warrants cross-departmental attention.`;
  } else {
    context = `${COMPONENT_LABELS[weakest[0]]} (${weakest[1]}/100) and ${COMPONENT_LABELS[secondWeakest[0]]} (${secondWeakest[1]}/100) are the primary areas of concern; ${COMPONENT_LABELS[strongest[0]]} at ${strongest[1]}/100 remains a relative strength.`;
  }

  const summary = `${lead} ${context}`;

  // ── Recommendations ───────────────────────────────────────────────────────
  // Rules: policy-oriented, budget-aware, no speculative infrastructure,
  // no arbitrary numeric targets, no program name-dropping without context.
  const closureRatePct  = (raw.codeViolationsClosedRate * 100).toFixed(0);
  const resolutionRate  = resRate(raw);

  const recommendations: Record<keyof ComponentScores, string> = {
    safety: `Emergency response demand in this district — ${perCapita10k(raw.fireResponseCount90d, pop)} Fire/EMS incidents per 10,000 residents alongside ${raw.nuisanceCount90d} nuisance reports — suggests continued pressure on public safety resources. A coverage and deployment review for this district would determine whether current resource allocation is appropriate or whether redistribution is warranted within the existing operational envelope.`,

    economic: `The district's economic conditions reflect limited construction activity (${raw.permits180d} permits in the past 180 days, ${raw.permitsNewConstruction} new construction) and modest business license growth (${raw.bizLicensesNew} new licenses). The appropriate near-term response is to assess structural barriers to investment — including zoning, permitting efficiency, and infrastructure readiness — before pursuing promotional programming, which tends to have limited effect when underlying conditions are the constraint.`,

    services: `City Services Responsiveness in this district — a ${resolutionRate}% resolution rate and ${raw.avgResolutionDays}-day average close time across ${raw.requests311Total} service requests — indicates that delivery capacity may not be keeping pace with demand. The priority is diagnosing the root cause: whether the gap reflects workload distribution imbalances, triage policy, or category-specific backlogs will determine whether the appropriate lever is staffing, process redesign, or intra-departmental resource reallocation.`,

    code: `Code compliance in this district reflects a ${closureRatePct}% closure rate against a city median of 26%, with ${raw.codeViolationsOpen} open violations. Improving outcomes requires distinguishing between chronic non-compliance — where enforcement escalation and lien tools are appropriate — and capacity-limited enforcement, where process or staffing improvements are the lever. A violation cluster analysis would clarify which condition predominates and enable a proportionate response.`,

    community: `Community resource access in this district${raw.parks + raw.communityCenters + raw.schools < 5 ? " is limited relative to peer districts" : " may not be equitably distributed across the district's geography"}. Before considering capital investment, the appropriate first step is a utilization and access analysis of existing facilities — this determines whether gaps reflect genuine undersupply or barriers to access, and supports better-informed capital planning.`,
  };

  // ── Actions ───────────────────────────────────────────────────────────────
  // Rules: council/manager-level directives only; start with an action verb;
  // no tactical micro-steps; no arbitrary numeric benchmarks.
  const actionTemplates: Record<keyof ComponentScores, [string, string, string]> = {
    safety: [
      `Direct the Public Safety department to conduct a service coverage analysis for ${district.name} and present findings in the next budget cycle`,
      `Coordinate with Neighborhood Services to assess whether nuisance reports in this district are geographically concentrated, which would support a targeted abatement strategy`,
      `Include public safety resource allocation for this district in the upcoming operational budget review`,
    ],
    economic: [
      `Commission a diagnostic review of investment barriers in ${district.name} — including permitting timelines, infrastructure gaps, and zoning readiness — as a prerequisite to targeted economic development planning`,
      `Evaluate whether current commercial conditions in this district qualify for existing small business support programs, and assess program uptake rates before expanding outreach`,
      `Include this district's economic development trajectory in the next annual economic development strategy and capital planning review`,
    ],
    services: [
      `Direct Neighborhood Services to audit open 311 request categories in ${district.name} and present a resolution timeline to the council`,
      `Evaluate whether current service staffing allocations reflect 311 demand distribution across all nine districts, and identify any rebalancing opportunities`,
      `Establish a quarterly performance review cadence for 311 responsiveness across districts scoring below 60 on City Services`,
    ],
    code: [
      `Direct Code Enforcement to provide a violation cluster analysis for ${district.name}, identifying properties with repeated unresolved citations`,
      `Evaluate whether the district's ${closureRatePct}% closure rate reflects procedural constraints, staffing capacity, or property owner non-response, and recommend corrective action accordingly`,
      `Include code compliance performance for this district in the next review of lien enforcement and legal referral protocols`,
    ],
    community: [
      `Request a utilization report for existing community facilities in ${district.name} before evaluating any new capital investments`,
      `Evaluate the geographic distribution of community resources within this district as part of the Envision Montgomery 2040 equity analysis`,
      `Include community resource adequacy for this district in the next capital improvement plan cycle`,
    ],
  };

  // Primary actions from weakest; second action from second-weakest if different
  const [a0, , a2] = actionTemplates[weakest[0]];
  const secondAction =
    secondWeakest[0] !== weakest[0]
      ? actionTemplates[secondWeakest[0]][0]
      : actionTemplates[weakest[0]][1];

  const actions: string[] = [a0, secondAction, a2];

  // ── Alert ─────────────────────────────────────────────────────────────────
  let alert: string | null = null;
  if (overall < 40) {
    alert = "⚠ PRIORITY ALERT: Multiple indicators are critically below threshold. Recommend prioritizing this district in the next council work session and initiating a cross-departmental operational review.";
  } else if (critical.length >= 2) {
    alert = `⚠ WATCH: ${critical.length} components scoring below 45. The breadth of underperformance in ${district.name} warrants proactive coordination before conditions deteriorate further.`;
  } else if (concerning.length >= 3 && overall < 60) {
    alert = `⚠ WATCH: Three or more components below 60. The convergence of underperformance in ${district.name} suggests systemic rather than isolated factors and merits a coordinated response.`;
  }

  return {
    summary,
    recommendation: recommendations[weakest[0]],
    actions,
    alert,
  };
}

// ─── AI-Powered Briefing ──────────────────────────────────────────────────────

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
  if (!apiKey) {
    return generateLocalBriefing(district, scores, raw);
  }

  try {
    const closureRatePct = (raw.codeViolationsClosedRate * 100).toFixed(0);
    const resolution     = resRate(raw);
    const pop            = district.population;

    const prompt = `You are a senior municipal strategy advisor preparing a district health briefing for the Montgomery, Alabama City Council and city manager.

DISTRICT: ${district.name} (${district.area}) — Population ~${pop.toLocaleString()}

DISTRICT HEALTH INDEX: ${scores.overall}/100 — ${scores.label}

COMPONENT SCORES (0–100; below 60 requires attention):
  Public Safety              ${scores.safety}
  Economic Vitality          ${scores.economic}
  City Services              ${scores.services}
  Code Compliance            ${scores.code}
  Community Resource Access  ${scores.community}

UNDERLYING DATA:
  Fire/EMS response volume:   ${raw.fireResponseCount90d} incidents — ${perCapita10k(raw.fireResponseCount90d, pop)}/10K residents (most recent available records)
  Environmental nuisances:    ${raw.nuisanceCount90d} reports
  Construction permits (180d): ${raw.permits180d} total (${raw.permitsNewConstruction} new construction, ${raw.permits180d - raw.permitsNewConstruction} renovation)
  Business licenses:          ${raw.bizLicensesActive} active, ${raw.bizLicensesNew} new in past 180 days
  311 service requests:       ${raw.requests311Total} total — ${raw.requests311Resolved} resolved (${resolution}%), avg ${raw.avgResolutionDays} days to close
  Open code violations:       ${raw.codeViolationsOpen} (${closureRatePct}% closed — city median is 26%)
  Community resources:        ${raw.parks} parks, ${raw.communityCenters} community centers, ${raw.fireStations + raw.policeStations} emergency facilities, ${raw.schools} schools, ${raw.pharmacies} pharmacies

BRIEFING REQUIREMENTS:
1. Tone: senior consulting advisory — concise, evidence-driven, calm, credible. Not tactical, not alarmist.
2. Audience: city council members and the city manager — assume financial and operational literacy.
3. Only surface signals that are strategically meaningful. Ignore minor fluctuations. Prioritize: scores below 60, significant outliers, operational risk signals, economic momentum or decline.
4. Recommendations must be realistic for municipal government: operational improvements, resource allocation, service delivery, or capital planning priorities. Not speculative infrastructure, arbitrary numeric targets, or program name-dropping unsupported by the data.
5. Actions must be council or manager-level directives — start each with a verb (Review, Evaluate, Commission, Direct, Prioritize, Coordinate). Not tactical micro-steps.
6. If the district is performing well, say so clearly — do not manufacture concerns.
7. Do not reference trend percentages smaller than ±5% — they are not strategically meaningful.

EXAMPLES OF WHAT NOT TO WRITE:
  BAD summary: "EMS incidents increased 0.0%."
  BAD action: "Identify site for a community center."
  BAD action: "Set a 10-day resolution target."
  BAD recommendation: "Promote the S.E.E.D. Grant program to businesses."

EXAMPLES OF THE RIGHT REGISTER:
  GOOD summary context: "Ongoing emergency response demand remains elevated relative to peer districts, suggesting continued pressure on public safety resources."
  GOOD action: "Direct Code Enforcement to provide a violation cluster analysis identifying properties with repeated unresolved citations."
  GOOD recommendation: "The district's code compliance conditions reflect a closure rate substantially below the city median, which warrants a diagnostic review to distinguish between enforcement capacity constraints and chronic property-owner non-compliance — the appropriate corrective action differs for each."

Respond with JSON only (no markdown):
{
  "summary": "2–3 sentence executive overview. Lead with the district's overall condition, identify the most significant strength and weakness, and note any convergence of concerning signals.",
  "recommendation": "2–3 sentences. Strategic recommendation focused on the weakest component. Policy-oriented, budget-aware, realistic for municipal timelines.",
  "actions": [
    "High-level council or manager directive — starts with a verb",
    "Second directive — different focus area",
    "Third directive — medium-term or forward-looking"
  ],
  "alert": null
}

Set alert to a brief string (not null) only if overall < 45 or 3+ components score below 50. Keep it factual, not alarming.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 750,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error("Claude API error:", response.status);
      return generateLocalBriefing(district, scores, raw);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "";

    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    return {
      summary:        parsed.summary        || "",
      recommendation: parsed.recommendation || "",
      actions:        Array.isArray(parsed.actions) ? parsed.actions : undefined,
      alert:          parsed.alert && parsed.alert !== "null" ? parsed.alert : null,
    };
  } catch (error) {
    console.error("AI briefing generation failed, using local fallback:", error);
    return generateLocalBriefing(district, scores, raw);
  }
}
