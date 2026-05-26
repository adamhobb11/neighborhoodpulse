/**
 * AI Briefing Generator
 *
 * Produces executive-level council briefings for each district.
 * Tone target: senior municipal strategy advisory — evidence-driven,
 * concise, realistic, and appropriate for city council leadership.
 *
 * Recommendation posture is calibrated to the district's health band:
 *   Thriving  (75–100): monitoring and maintenance — no intervention language
 *   Stable    (60–74):  incremental improvement — targeted, moderate tone
 *   Watch     (45–59):  active intervention — resource and performance focus
 *   At Risk   (<45):    priority action — urgent, cross-department coordination
 *
 * In production, calls the Claude API for richer analysis.
 * The local fallback generates deterministic briefings from score data.
 */

import type { District, DistrictScores, DistrictRawData, AIBriefing, ComponentScores } from "../data/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type HealthBand = "thriving" | "stable" | "watch" | "at_risk";

// ─── Constants ────────────────────────────────────────────────────────────────

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

function getHealthBand(label: DistrictScores["label"]): HealthBand {
  if (label === "Thriving") return "thriving";
  if (label === "Stable")   return "stable";
  if (label === "Watch")    return "watch";
  return "at_risk"; // "At Risk" or "Critical"
}

// ─── Band-Specific Recommendation Builders ────────────────────────────────────

/**
 * Returns the recommendation text appropriate for the district's health band.
 * Thriving → monitoring/maintenance. Stable → incremental improvement.
 * Watch/At Risk → active intervention.
 */
function buildRecommendation(
  band: HealthBand,
  weakestKey: keyof ComponentScores,
  weakestScore: number,
  strongestKey: keyof ComponentScores,
  strongestScore: number,
  concerning: [keyof ComponentScores, number][],
  raw: DistrictRawData,
  pop: number,
): string {
  const wLabel          = COMPONENT_LABELS[weakestKey];
  const sLabel          = COMPONENT_LABELS[strongestKey];
  const closureRatePct  = (raw.codeViolationsClosedRate * 100).toFixed(0);
  const resolution      = resRate(raw);

  // ── THRIVING — all components healthy ──────────────────────────────────────
  if (band === "thriving" && concerning.length === 0) {
    return `District performance is strong across all five measured components, with ${sLabel} leading at ${strongestScore}/100. No immediate operational intervention is recommended. ${wLabel} at ${weakestScore}/100 is the lowest-scoring dimension and should be included in routine monitoring over the next two quarters to confirm current conditions hold as the city enters the next planning cycle.`;
  }

  // ── THRIVING — one anomalous component below 60 ────────────────────────────
  if (band === "thriving") {
    const anomalyNote: Record<keyof ComponentScores, string> = {
      safety:    `Fire/EMS response volume and nuisance conditions in this district are within a manageable range, though below the threshold for a strong score.`,
      economic:  `Construction permit activity and new business formation reflect a modest pace of investment that, while below threshold, is not inconsistent with a maturing district.`,
      services:  `311 responsiveness is below the optimal threshold but not at a level requiring immediate intervention.`,
      code:      `Open violations and a ${closureRatePct}% closure rate indicate enforcement attention is warranted, though overall district conditions remain strong.`,
      community: `Community resource availability may be limited relative to peer districts, though this does not affect the district's overall strong performance across other dimensions.`,
    };
    return `Overall district performance is strong, with ${wLabel} at ${weakestScore}/100 representing the single below-threshold dimension. ${anomalyNote[weakestKey]} This gap does not require immediate intervention but should be incorporated into routine monitoring and reviewed during the next relevant planning cycle.`;
  }

  // ── STABLE — incremental improvement focus ─────────────────────────────────
  if (band === "stable") {
    const stableRec: Record<keyof ComponentScores, string> = {
      safety: `Public Safety at ${weakestScore}/100 is the district's primary opportunity for improvement. Fire/EMS response volume and nuisance conditions suggest demand remains elevated; a review of service deployment patterns would determine whether targeted adjustments could improve performance within the current resource envelope.`,

      economic: `Economic Vitality at ${weakestScore}/100 presents a clear opportunity for incremental improvement. Current permit activity (${raw.permits180d} permits over 180 days, ${raw.permitsNewConstruction} new construction) and new business formation (${raw.bizLicensesNew} licenses) reflect modest momentum. A review of development conditions — permitting efficiency and zoning alignment — would identify whether targeted support could accelerate activity without significant new investment.`,

      services: `City Services Responsiveness at ${weakestScore}/100 indicates room to improve service delivery efficiency. With a ${resolution}% resolution rate and ${raw.avgResolutionDays}-day average close time across ${raw.requests311Total} requests, the district's 311 performance suggests process or workload improvements may be available within the current operational envelope.`,

      code: `Code Compliance at ${weakestScore}/100 is the primary opportunity for improvement. The district's ${closureRatePct}% closure rate remains below the city median of 26%, with ${raw.codeViolationsOpen} open violations. A targeted review of enforcement workflow and case aging would determine whether incremental process adjustments or modest resource reallocation could improve closure performance.`,

      community: `Community Resource Access at ${weakestScore}/100 suggests facility availability or distribution may be limiting resident access. A utilization and coverage review of existing resources in this district would clarify whether the gap reflects undersupply or access barriers, informing future capital planning priorities without speculative investment.`,
    };
    return stableRec[weakestKey];
  }

  // ── WATCH / AT RISK — active intervention ─────────────────────────────────
  const interventionRec: Record<keyof ComponentScores, string> = {
    safety: `Emergency response demand in this district — ${perCapita10k(raw.fireResponseCount90d, pop)} Fire/EMS incidents per 10,000 residents alongside ${raw.nuisanceCount90d} nuisance reports — suggests continued pressure on public safety resources. A coverage and deployment review would determine whether current resource allocation is appropriate or whether redistribution is warranted within the existing operational envelope.`,

    economic: `The district's economic conditions reflect limited construction activity (${raw.permits180d} permits in the past 180 days, ${raw.permitsNewConstruction} new construction) and modest business license growth (${raw.bizLicensesNew} new licenses). The near-term priority is a diagnostic review of investment conditions — permitting efficiency and zoning readiness — before pursuing outreach programs, which tend to have limited effect when underlying conditions are the constraint.`,

    services: `City Services Responsiveness — a ${resolution}% resolution rate and ${raw.avgResolutionDays}-day average close time across ${raw.requests311Total} requests — indicates delivery capacity is not keeping pace with demand. The priority is identifying the root cause: whether the gap reflects workload distribution, triage policy, or category-specific backlogs determines whether the appropriate lever is staffing, process redesign, or intra-departmental reallocation.`,

    code: `Code compliance in this district reflects a ${closureRatePct}% closure rate against a city median of 26%, with ${raw.codeViolationsOpen} open violations. Improving outcomes requires distinguishing between chronic non-compliance — where lien and enforcement escalation are appropriate — and capacity-limited enforcement, where process or staffing improvements are the lever. A violation cluster analysis would clarify which condition predominates.`,

    community: `Community resource access in this district is limited${raw.parks + raw.communityCenters + raw.schools < 5 ? " relative to peer districts" : " in its geographic distribution"}. Before considering capital investment, the appropriate first step is a utilization and access analysis of existing facilities — this determines whether gaps reflect genuine undersupply or barriers to access, and supports better-informed capital planning.`,
  };
  return interventionRec[weakestKey];
}

// ─── Band-Specific Action Builders ────────────────────────────────────────────

/**
 * Returns three action items calibrated to the district's health band.
 * Actions are council/manager-level directives, not tactical micro-steps.
 */
function buildActions(
  band: HealthBand,
  weakestKey: keyof ComponentScores,
  weakestScore: number,
  secondWeakestKey: keyof ComponentScores,
  strongestKey: keyof ComponentScores,
  strongestScore: number,
  concerning: [keyof ComponentScores, number][],
  district: District,
  raw: DistrictRawData,
): string[] {
  const dn             = district.name;
  const wLabel         = COMPONENT_LABELS[weakestKey];
  const sLabel         = COMPONENT_LABELS[strongestKey];
  const closureRatePct = (raw.codeViolationsClosedRate * 100).toFixed(0);
  const resolution     = resRate(raw);

  // ── THRIVING — all healthy: pure monitoring actions ────────────────────────
  if (band === "thriving" && concerning.length === 0) {
    return [
      `Continue monitoring ${wLabel} indicators during the next quarterly planning and budget review`,
      `Maintain current service delivery and public safety investment levels — current performance reflects sustained operational consistency`,
      `Include ${dn} as a benchmark reference in the next city-wide performance review and capital improvement plan discussion`,
    ];
  }

  // ── THRIVING — one anomalous component: mostly monitoring ─────────────────
  if (band === "thriving") {
    return [
      `Monitor ${wLabel} trends over the next two quarters; flag for council review if the score declines further`,
      `Maintain strong performance in ${sLabel} (${strongestScore}/100) and continue current investment levels across the district's other high-performing dimensions`,
      `Include ${wLabel} conditions in the next relevant capital or operational planning discussion as a low-priority watch item`,
    ];
  }

  // ── STABLE — incremental improvement actions ───────────────────────────────
  if (band === "stable") {
    const stableActions: Record<keyof ComponentScores, [string, string, string]> = {
      safety: [
        `Review public safety service deployment in ${dn} and identify whether targeted adjustments can improve response efficiency within the current budget`,
        `Evaluate coordination between Code Enforcement and Neighborhood Services on nuisance abatement to address the current ${raw.nuisanceCount90d}-report backlog`,
        `Include public safety performance for ${dn} in the next quarterly budget review with a focus on incremental improvement`,
      ],
      economic: [
        `Review development conditions in ${dn} — permitting efficiency and zoning alignment — to identify incremental barriers to investment activity`,
        `Evaluate whether current business support programs are adequately reaching commercial operators in ${dn}, and assess uptake before expanding outreach`,
        `Include ${dn}'s economic development trajectory in the next annual planning review`,
      ],
      services: [
        `Review 311 request categories and aging in ${dn} and identify process improvements that could improve the district's ${resolution}% resolution rate`,
        `Evaluate whether workload distribution across departments contributes to the ${raw.avgResolutionDays}-day average resolution time in this district`,
        `Include City Services performance for ${dn} in the next quarterly review, with a focus on incremental efficiency gains`,
      ],
      code: [
        `Review Code Enforcement case aging in ${dn} and identify workflow adjustments that could improve the ${closureRatePct}% closure rate toward the city median`,
        `Evaluate whether enforcement resources in ${dn} are proportionate to the current ${raw.codeViolationsOpen} open violations, and consider reallocation if the data supports it`,
        `Include code compliance performance for ${dn} in the next lien enforcement and case resolution protocol review`,
      ],
      community: [
        `Request a facility utilization summary for ${dn} and evaluate whether current resource distribution supports equitable access across the district`,
        `Include community resource availability for ${dn} in the next Envision Montgomery 2040 equity analysis`,
        `Review community infrastructure conditions for ${dn} during the next capital improvement plan cycle`,
      ],
    };

    const [a0, a1, a2] = stableActions[weakestKey];
    // Substitute second-weakest first action for a1 if different component
    const secondAction =
      secondWeakestKey !== weakestKey
        ? stableActions[secondWeakestKey][0]
        : a1;
    return [a0, secondAction, a2];
  }

  // ── WATCH / AT RISK — intervention actions ─────────────────────────────────
  const interventionActions: Record<keyof ComponentScores, [string, string, string]> = {
    safety: [
      `Direct the Public Safety department to conduct a service coverage analysis for ${dn} and present findings in the next budget cycle`,
      `Coordinate with Neighborhood Services to assess whether nuisance reports in ${dn} are geographically concentrated, which would support a targeted abatement strategy`,
      `Include public safety resource allocation for ${dn} in the upcoming operational budget review`,
    ],
    economic: [
      `Commission a diagnostic review of investment conditions in ${dn} — permitting timelines, infrastructure gaps, and zoning readiness — as a prerequisite to targeted economic development planning`,
      `Evaluate whether current commercial conditions in ${dn} qualify for existing small business support programs, and assess uptake rates before expanding outreach`,
      `Include ${dn}'s economic development trajectory in the next annual economic development strategy and capital planning review`,
    ],
    services: [
      `Direct Neighborhood Services to audit open 311 request categories in ${dn} and present a resolution timeline to the council`,
      `Evaluate whether current service staffing allocations reflect 311 demand distribution across all nine districts, and identify rebalancing opportunities`,
      `Establish a quarterly performance review cadence for 311 responsiveness across districts scoring below 60 on City Services`,
    ],
    code: [
      `Direct Code Enforcement to provide a violation cluster analysis for ${dn}, identifying properties with repeated unresolved citations`,
      `Evaluate whether the district's ${closureRatePct}% closure rate reflects procedural constraints, staffing capacity, or property owner non-response, and recommend corrective action`,
      `Include code compliance performance for ${dn} in the next review of lien enforcement and legal referral protocols`,
    ],
    community: [
      `Request a utilization report for existing community facilities in ${dn} before evaluating any new capital investments`,
      `Evaluate the geographic distribution of community resources within ${dn} as part of the Envision Montgomery 2040 equity analysis`,
      `Include community resource adequacy for ${dn} in the next capital improvement plan cycle`,
    ],
  };

  const [a0, , a2] = interventionActions[weakestKey];
  const secondAction =
    secondWeakestKey !== weakestKey
      ? interventionActions[secondWeakestKey][0]
      : interventionActions[weakestKey][1];

  return [a0, secondAction, a2];
}

// ─── Local Fallback ───────────────────────────────────────────────────────────

/**
 * Generate a briefing for a district using local rule-based logic.
 * This is the fallback when the Claude API is not configured.
 */
export function generateLocalBriefing(
  district: District,
  scores: DistrictScores,
  raw: DistrictRawData
): AIBriefing {
  const { safety, economic, services, code, community, overall } = scores;

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

  const band = getHealthBand(scores.label);

  // ── Summary ───────────────────────────────────────────────────────────────
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

  // ── Recommendation ────────────────────────────────────────────────────────
  const recommendation = buildRecommendation(
    band,
    weakest[0], weakest[1],
    strongest[0], strongest[1],
    concerning,
    raw, district.population,
  );

  // ── Actions ───────────────────────────────────────────────────────────────
  const actions = buildActions(
    band,
    weakest[0], weakest[1],
    secondWeakest[0],
    strongest[0], strongest[1],
    concerning,
    district, raw,
  );

  // ── Alert ─────────────────────────────────────────────────────────────────
  // Alerts are suppressed for Thriving districts — no manufactured concerns.
  let alert: string | null = null;
  if (band !== "thriving") {
    if (overall < 40) {
      alert = "⚠ PRIORITY ALERT: Multiple indicators are critically below threshold. Recommend prioritizing this district in the next council work session and initiating a cross-departmental operational review.";
    } else if (critical.length >= 2) {
      alert = `⚠ WATCH: ${critical.length} components scoring below 45. The breadth of underperformance in ${district.name} warrants proactive coordination before conditions deteriorate further.`;
    } else if (concerning.length >= 3 && overall < 60) {
      alert = `⚠ WATCH: Three or more components below 60. The convergence of underperformance in ${district.name} suggests systemic rather than isolated factors and merits a coordinated response.`;
    }
  }

  return { summary, recommendation, actions, alert };
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
    const band           = getHealthBand(scores.label);

    // Per-band instruction block injected into the prompt
    const bandGuidance: Record<HealthBand, string> = {
      thriving: `THRIVING BAND (75–100): This district is performing well.
- Do NOT manufacture concerns or use intervention language.
- If all components score above 60: explicitly state no immediate intervention is recommended.
- Focus on: monitoring, maintaining current performance, and long-term planning.
- Preferred action verbs: Continue, Maintain, Monitor, Review, Include.
- A Thriving district receiving intervention-oriented recommendations is a briefing failure.
- BAD: "Evaluate structural barriers to investment and review infrastructure readiness."
- BETTER: "No immediate intervention is recommended. Economic Vitality should be monitored over the next two quarters to confirm current activity levels represent a stable baseline."`,

      stable: `STABLE BAND (60–74): This district is performing within expectations with room for targeted improvement.
- Identify the weakest component and recommend incremental operational improvement.
- Tone should be measured — "consider improving" not "urgently address."
- Preferred action verbs: Review, Evaluate, Prioritize, Consider.
- Do not use urgent or alarm language — this district is stable, not at risk.`,

      watch: `WATCH BAND (45–59): This district shows early signs of concern and warrants active but measured response.
- Focus on resource allocation, performance improvement, and root-cause identification.
- Tone: factual concern without alarm — flag the issue, recommend clear next steps.
- Preferred action verbs: Direct, Evaluate, Commission, Coordinate.`,

      at_risk: `AT RISK / CRITICAL BAND (<45): This district requires priority attention.
- Focus on urgent operational review, cross-department coordination, and resource deployment.
- Tone: direct and action-oriented — this is a real problem requiring real action.
- Preferred action verbs: Direct, Commission, Prioritize, Escalate, Coordinate.`,
    };

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
  Fire/EMS response volume:    ${raw.fireResponseCount90d} incidents — ${perCapita10k(raw.fireResponseCount90d, pop)}/10K residents (most recent available records)
  Environmental nuisances:     ${raw.nuisanceCount90d} reports
  Construction permits (180d): ${raw.permits180d} total (${raw.permitsNewConstruction} new construction, ${raw.permits180d - raw.permitsNewConstruction} renovation)
  Business licenses:           ${raw.bizLicensesActive} active, ${raw.bizLicensesNew} new in past 180 days
  311 service requests:        ${raw.requests311Total} total — ${raw.requests311Resolved} resolved (${resolution}%), avg ${raw.avgResolutionDays} days to close
  Open code violations:        ${raw.codeViolationsOpen} (${closureRatePct}% closed — city median is 26%)
  Community resources:         ${raw.parks} parks, ${raw.communityCenters} community centers, ${raw.fireStations + raw.policeStations} emergency facilities, ${raw.schools} schools, ${raw.pharmacies} pharmacies

HEALTH BAND GUIDANCE — calibrate your entire response to this:
${bandGuidance[band]}

UNIVERSAL BRIEFING RULES:
1. Tone: senior consulting advisory — concise, evidence-driven, calm, credible. Not tactical, not alarmist.
2. Audience: city council members and city manager — assume financial and operational literacy.
3. Only surface signals that are strategically meaningful. Ignore minor fluctuations.
4. Recommendations must be realistic for municipal government. Not speculative infrastructure, arbitrary numeric targets, or program name-dropping unsupported by data.
5. Actions must be council or manager-level directives — start each with a verb. Not tactical micro-steps.
6. Do not reference trend percentages smaller than ±5% — they carry no strategic significance.
7. Do not force a problem where one does not exist.

EXAMPLES OF WHAT NOT TO WRITE (for any band):
  BAD: "EMS incidents increased 0.0%."
  BAD: "Identify a site for a community center."
  BAD: "Set a 10-day resolution target."
  BAD (for Thriving): "Assess structural barriers to investment and evaluate infrastructure readiness."

EXAMPLES OF THE RIGHT REGISTER:
  GOOD (Thriving): "District performance remains strong across all major indicators. No immediate intervention is recommended. Economic Vitality remains the lowest-scoring component and should be monitored over the next two quarters."
  GOOD (Thriving action): "Continue monitoring permit and business license activity during the next quarterly planning cycle."
  GOOD (Watch): "Code compliance conditions reflect a closure rate substantially below the city median. A diagnostic review should distinguish between enforcement capacity constraints and chronic property-owner non-compliance — the appropriate corrective action differs for each."

Respond with JSON only (no markdown):
{
  "summary": "2–3 sentence executive overview. Lead with the district's overall condition, identify the most significant strength and weakness, and note any convergence of concerning signals.",
  "recommendation": "2–3 sentences. Calibrated to the health band above. For Thriving: monitoring language. For Stable: incremental improvement. For Watch/At Risk: active intervention.",
  "actions": [
    "Council or manager directive — starts with a verb, calibrated to health band",
    "Second directive — different focus area",
    "Third directive — medium-term or forward-looking"
  ],
  "alert": null
}

Set alert to a brief factual string (not null) only if overall < 45 or 3+ components score below 50. Never set an alert for a Thriving district.`;

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
