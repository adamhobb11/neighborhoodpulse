"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { DistrictData, AIBriefing, ComponentScores, DistrictRawData } from "@/lib/data/types";
import { getScoreColor, getScoreLabel, calculateDistrictScores, DEFAULT_WEIGHTS } from "@/lib/scoring/engine";

// ─── Fixed district colors (Montgomery official palette) ─────────────────────

const DISTRICT_COLORS: Record<number, string> = {
  1: "#dc2626",  // Red
  2: "#0891b2",  // Teal/Cyan
  3: "#ea580c",  // Orange
  4: "#7c3aed",  // Purple
  5: "#db2777",  // Pink/Magenta
  6: "#84cc16",  // Lime/Green
  7: "#d97706",  // Amber/Gold
  8: "#1d4ed8",  // Dark Blue
  9: "#16a34a",  // Green
};

// ─── Hardcoded marker positions for districts where centroid is misleading ────

const MARKER_OVERRIDES: Record<number, [number, number]> = {
  5: [32.345, -86.245],
};

// ─── Methodology content ──────────────────────────────────────────────────────

const METHODOLOGY = [
  {
    key: "safety" as keyof ComponentScores,
    label: "Public Safety",
    icon: "🛡",
    weight: 25,
    dataSource: "Fire/EMS response incidents and environmental nuisance reports from Montgomery's ArcGIS Open Data Portal",
    subFactors: [
      { name: "Incident rate per 10k residents", pct: 60 },
      { name: "Trend vs. prior 90-day period", pct: 25 },
      { name: "Environmental nuisance density", pct: 15 },
    ],
    plain: "Higher score = fewer emergency incidents per capita with an improving trend. Districts with rising incident volumes or high nuisance density score lower.",
  },
  {
    key: "economic" as keyof ComponentScores,
    label: "Economic Vitality",
    icon: "📈",
    weight: 20,
    dataSource: "Construction permits (180-day window) and new business license applications from Montgomery Open Data",
    subFactors: [
      { name: "Construction permit activity", pct: 45 },
      { name: "New vs. renovation construction ratio", pct: 25 },
      { name: "New business license growth", pct: 30 },
    ],
    plain: "Higher score = more construction investment and business growth, indicating economic health and investor confidence in the neighborhood.",
  },
  {
    key: "services" as keyof ComponentScores,
    label: "City Services Responsiveness",
    icon: "🏛",
    weight: 20,
    dataSource: "311 Service Request resolution rate and average days to close, from Montgomery's 311 system",
    subFactors: [
      { name: "Resolution rate (% of requests closed)", pct: 55 },
      { name: "Average time to resolution", pct: 45 },
    ],
    plain: "Higher score = city responds faster and more completely to resident service requests. Low scores may signal understaffing or resource misallocation in Neighborhood Services.",
  },
  {
    key: "code" as keyof ComponentScores,
    label: "Code Compliance",
    icon: "📋",
    weight: 20,
    dataSource: "Open code violations count and violation closure rate from Montgomery's Code Enforcement division",
    subFactors: [
      { name: "Open violations per capita (inverted)", pct: 60 },
      { name: "Closure rate — enforcement effectiveness", pct: 40 },
    ],
    plain: "Higher score = fewer unresolved violations and stronger enforcement follow-through. Open violations correlate with visible neighborhood deterioration and reduced property values.",
  },
  {
    key: "community" as keyof ComponentScores,
    label: "Community Resource Access",
    icon: "🏘",
    weight: 15,
    dataSource: "Count of parks, community centers, fire stations, police stations, schools, pharmacies, and tornado shelters within each district",
    subFactors: [
      { name: "Emergency facilities (fire + police)", pct: 25 },
      { name: "Parks", pct: 20 },
      { name: "Schools", pct: 20 },
      { name: "Community centers", pct: 15 },
      { name: "Pharmacies", pct: 10 },
      { name: "Tornado shelters", pct: 10 },
    ],
    plain: "Higher score = more community resources within the district. Reflects equity of public investment and quality-of-life infrastructure per Envision Montgomery 2040 goals.",
  },
];

// ─── Shared sub-components ────────────────────────────────────────────────────

/** Shows ▲/▼ with % change. inverted=true means a lower value is better (crimes, violations, etc.) */
function Chg({ current, prev, inverted = false }: { current: number; prev: number; inverted?: boolean }) {
  if (!prev) return null;
  const pct = ((current - prev) / prev) * 100;
  const goodForScore = inverted ? pct < 0 : pct > 0;
  const dir = goodForScore ? "▲" : "▼";
  return (
    <span className={`font-bold ${goodForScore ? "text-emerald-600" : "text-red-500"}`}>
      {dir} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function BRow({ label, sub, value, prev, inverted, weight, gap }: {
  label: string; sub?: string; value: string | number; prev?: number;
  inverted?: boolean; weight?: number; gap?: boolean;
}) {
  const numVal = typeof value === "number" ? value : undefined;
  return (
    <div className={`flex justify-between gap-2 items-start ${gap ? "mt-2 pt-2 border-t border-slate-200" : ""}`}>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-slate-700 leading-snug">{label}</div>
        {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
        {prev !== undefined && numVal !== undefined && (
          <div className="text-[10px] text-slate-400 mt-0.5">
            <Chg current={numVal} prev={prev} inverted={inverted} /> from {prev}
          </div>
        )}
      </div>
      <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
        <div className={`text-sm font-bold font-mono ${value === 0 && gap === undefined ? "text-amber-600" : "text-slate-800"}`}>
          {value}{value === 0 ? " ⚠" : ""}
        </div>
        {weight !== undefined && <div className="text-[10px] text-slate-400">wt {weight}%</div>}
      </div>
    </div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return <div className="text-[9px] font-bold text-slate-400 tracking-widest mt-3 mb-1.5 first:mt-0">{label}</div>;
}

const COMPONENT_INDEX_WEIGHT: Record<keyof ComponentScores, number> = {
  safety: 25, economic: 20, services: 20, code: 20, community: 15,
};

function ComponentScoreRow({ label, score, icon, trend, componentKey, raw, population, expanded, onToggle }: {
  label: string; score: number; icon: string; trend?: number;
  componentKey: keyof ComponentScores;
  raw: DistrictRawData; population: number;
  expanded: boolean; onToggle: () => void;
}) {
  const color = getScoreColor(score);
  const { gradStart, gradEnd } = GAUGE_STYLES[getScoreLabel(score)] ?? GAUGE_STYLES["Stable"];
  const hasTrend = trend !== undefined && trend !== 0;
  const trendPct = hasTrend ? (Math.abs(trend!) * 100).toFixed(1) : null;
  const improving = (trend ?? 0) > 0;
  const significant = Math.abs(trend ?? 0) * 100 > 10;

  const perCapita = (n: number) => ((n / Math.max(population, 1)) * 10000).toFixed(1);
  const resRate = raw.requests311Total > 0
    ? ((raw.requests311Resolved / raw.requests311Total) * 100).toFixed(0) : "0";
  const newConstRatio = raw.permits180d > 0
    ? ((raw.permitsNewConstruction / raw.permits180d) * 100).toFixed(0) : "0";
  const fireTrendPct = raw.fireResponseCountPrev90d > 0
    ? ((raw.fireResponseCount90d - raw.fireResponseCountPrev90d) / raw.fireResponseCountPrev90d * 100) : 0;
  const fireTrendDir = fireTrendPct > 0 ? "↑" : "↓";
  const trendAdjust = fireTrendPct < 0
    ? `+${Math.min(Math.abs(fireTrendPct / 100) * 40, 12).toFixed(1)} pts (improving)`
    : `-${Math.min(Math.abs(fireTrendPct / 100) * 40, 12).toFixed(1)} pts (worsening)`;

  return (
    <div className="mb-1.5">
      <div onClick={onToggle}
        className={`cursor-pointer rounded-lg px-2 py-2 -mx-2 transition-colors select-none ${expanded ? "bg-blue-50/60" : "hover:bg-slate-50"}`}>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs font-semibold text-slate-700 tracking-wide">{icon} {label}</span>
          <div className="flex items-center gap-1.5">
            {hasTrend && (
              <span className={`text-[10px] font-bold ${improving ? "text-emerald-500" : "text-rose-400"} ${significant && !improving ? "bg-rose-50 px-1 rounded" : ""}`}>
                {improving ? "▲" : "▼"} {trendPct}%
              </span>
            )}
            <span className="text-sm font-bold font-mono" style={{ color }}>{score}</span>
            <span className="text-slate-300 text-[11px]">{expanded ? "▾" : "▸"}</span>
          </div>
        </div>
        <div className="w-full h-2 bg-slate-100/70 rounded-full overflow-hidden">
          <div className="score-bar-fill h-full rounded-full"
            style={{ width: `${score}%`, background: `linear-gradient(to right, ${gradStart}, ${gradEnd})` }} />
        </div>
      </div>

      {expanded && (
        <div className="mx-0 mt-1 p-3 bg-slate-50 rounded-lg border border-slate-200 animate-fadein">
          {componentKey === "safety" && (<>
            <SectionLabel label="CRIME INCIDENTS — weight: 40%" />
            <div className="space-y-2.5">
              <BRow label="Violent Crimes (90d)" sub="Homicide, assault, robbery (counted 3×)"
                value={raw.violentCrimes90d} prev={raw.violentCrimesPrev90d} inverted weight={40} />
              <BRow label="Property Crimes (90d)" sub="Burglary, auto theft, larceny (counted 2×)"
                value={raw.propertyCrimes90d} prev={raw.propertyCrimesPrev90d} inverted />
              <BRow label="Minor Offenses (90d)" sub="Misdemeanor, disorderly conduct (counted 1×)"
                value={raw.minorOffenses90d} prev={raw.minorOffensesPrev90d} inverted />
            </div>
            <SectionLabel label="EMERGENCY RESPONSE — weight: 35%" />
            <BRow label="Fire/EMS Incidents (90d)" sub={`${perCapita(raw.fireResponseCount90d)}/10K residents`}
              value={raw.fireResponseCount90d} prev={raw.fireResponseCountPrev90d} inverted weight={35} />
            <SectionLabel label="ENVIRONMENTAL — weight: 10%" />
            <BRow label="Nuisance Reports (90d)" sub="Illegal dumping, blight, pollution complaints"
              value={raw.nuisanceCount90d} inverted weight={10} />
            <SectionLabel label="TREND MODIFIER — weight: 15%" />
            <BRow label="Fire/EMS Trend"
              sub={`${Math.abs(fireTrendPct).toFixed(1)}% ${fireTrendPct > 0 ? "increase" : "decrease"} in incidents → score ${fireTrendPct > 0 ? "penalty" : "bonus"}`}
              value={trendAdjust.split(" ")[0]} weight={15} />
          </>)}

          {componentKey === "economic" && (<>
            <SectionLabel label="CONSTRUCTION ACTIVITY — weight: 45%" />
            <div className="space-y-2.5">
              <BRow label="Total Permits (180d)" value={raw.permits180d} prev={raw.permits180dPrev} weight={45} />
              <BRow label="New Construction" sub="Ground-up builds (higher = more investment)"
                value={raw.permitsNewConstruction} prev={raw.permitsNewConstructionPrev} />
              <BRow label="Renovation / Other"
                value={raw.permits180d - raw.permitsNewConstruction}
                prev={raw.permits180dPrev - raw.permitsNewConstructionPrev} />
            </div>
            <SectionLabel label="BUSINESS GROWTH — weight: 30%" />
            <div className="space-y-2.5">
              <BRow label="New Business Licenses" value={raw.bizLicensesNew} prev={raw.bizLicensesNewPrev} weight={30} />
              <BRow label="Active Licenses Total" sub="Current active in district" value={raw.bizLicensesActive} />
            </div>
            <SectionLabel label="DEVELOPMENT RATIO — weight: 25%" />
            <BRow label="New Construction Ratio" sub="% of permits that are new builds — higher signals confidence"
              value={`${newConstRatio}%`} weight={25} />
          </>)}

          {componentKey === "services" && (<>
            <SectionLabel label="RESOLUTION PERFORMANCE — weight: 55%" />
            <div className="space-y-2.5">
              <BRow label="Resolution Rate" sub={`${raw.requests311Resolved} of ${raw.requests311Total} requests closed`}
                value={`${resRate}%`}
                prev={raw.requests311TotalPrev > 0 ? Math.round((raw.requests311ResolvedPrev / raw.requests311TotalPrev) * 100) : undefined}
                weight={55} />
              <BRow label="Requests Resolved" value={raw.requests311Resolved} prev={raw.requests311ResolvedPrev} />
              <BRow label="Total 311 Requests" value={raw.requests311Total} prev={raw.requests311TotalPrev} inverted />
            </div>
            <SectionLabel label="RESPONSE SPEED — weight: 45%" />
            <BRow label="Avg Resolution Time" sub={`Target: ≤ 7 days · Currently ${raw.avgResolutionDays > 7 ? "above" : "on"} target`}
              value={`${raw.avgResolutionDays}d`} prev={raw.avgResolutionDaysPrev} inverted weight={45} />
          </>)}

          {componentKey === "code" && (<>
            <SectionLabel label="VIOLATIONS — weight: 60%" />
            <BRow label="Open Code Violations" sub={`${perCapita(raw.codeViolationsOpen)}/10K residents per capita`}
              value={raw.codeViolationsOpen} prev={raw.codeViolationsOpenPrev} inverted weight={60} />
            <SectionLabel label="ENFORCEMENT — weight: 40%" />
            <BRow label="Closure Rate" sub={`Target ≥ 60% · ${(raw.codeViolationsClosedRate * 100).toFixed(0)}% of violations successfully closed`}
              value={`${(raw.codeViolationsClosedRate * 100).toFixed(0)}%`}
              prev={Math.round(raw.codeViolationsClosedRatePrev * 100)}
              weight={40} />
          </>)}

          {componentKey === "community" && (<>
            <SectionLabel label="EMERGENCY SERVICES — weight: 25%" />
            <div className="space-y-2">
              <BRow label="Fire Stations" value={raw.fireStations} weight={25} />
              <BRow label="Police Stations" value={raw.policeStations} />
            </div>
            <SectionLabel label="RECREATION — weight: 20%" />
            <BRow label="Parks & Green Spaces" value={raw.parks} weight={20} />
            <SectionLabel label="EDUCATION — weight: 20%" />
            <BRow label="Schools (K–12)" value={raw.schools} weight={20} />
            <SectionLabel label="COMMUNITY — weight: 15%" />
            <BRow label="Community Centers" value={raw.communityCenters} weight={15} />
            <SectionLabel label="HEALTHCARE — weight: 10%" />
            <BRow label="Pharmacies" value={raw.pharmacies} weight={10} />
            <SectionLabel label="EMERGENCY PREP — weight: 10%" />
            <BRow label="Tornado Shelters" value={raw.shelters} weight={10} />
            <div className="text-[9px] text-amber-600 mt-2 pt-2 border-t border-slate-200">⚠ = zero resources identified. These are static counts — no trend arrows.</div>
          </>)}

          <div className="mt-3 pt-2 border-t border-slate-200 text-[10px] text-slate-500">
            Weight in overall Health Index: <span className="font-bold text-slate-700">{COMPONENT_INDEX_WEIGHT[componentKey]}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Semi-circle gauge for District Health Index ──────────────────────────────

const GAUGE_STYLES: Record<string, { gradStart: string; gradEnd: string; textColor: string }> = {
  Thriving:  { gradStart: "#6ee7b7", gradEnd: "#059669", textColor: "#059669" },
  Stable:    { gradStart: "#bae6fd", gradEnd: "#0369a1", textColor: "#0369a1" },
  Watch:     { gradStart: "#fef08a", gradEnd: "#ca8a04", textColor: "#ca8a04" },
  "At Risk": { gradStart: "#fca5a5", gradEnd: "#b91c1c", textColor: "#b91c1c" },
  Critical:  { gradStart: "#fecdd3", gradEnd: "#9f1239", textColor: "#9f1239" },
};

const BADGE_STYLES: Record<string, string> = {
  Thriving:  "bg-gradient-to-r from-emerald-50 to-emerald-100 border border-emerald-200 text-emerald-700 shadow-sm",
  Stable:    "bg-gradient-to-r from-sky-50 to-sky-100 border border-sky-200 text-sky-700 shadow-sm",
  Watch:     "bg-gradient-to-r from-yellow-50 to-yellow-100 border border-yellow-200 text-yellow-700 shadow-sm",
  "At Risk": "bg-gradient-to-r from-red-50 to-red-100 border border-red-200 text-red-700 shadow-sm",
  Critical:  "bg-gradient-to-r from-rose-50 to-rose-100 border border-rose-200 text-rose-700 shadow-sm",
};

const INTERPRETATIONS: Record<string, string> = {
  Thriving:  "Performing ahead of district benchmarks.",
  Stable:    "Performing within expected range.",
  Watch:     "Showing early signs of concern.",
  "At Risk": "Requires closer monitoring.",
  Critical:  "Immediate attention recommended.",
};

function SemiGauge({ score, label }: { score: number; label: keyof typeof GAUGE_STYLES }) {
  const { gradStart, gradEnd, textColor } = GAUGE_STYLES[label] ?? GAUGE_STYLES["Stable"];
  // Geometry: semi-circle, flat side down, opening upward
  // cx=100 cy=100 r=82 sw=10 → path from (18,100) over (100,18) to (182,100)
  const r = 82, sw = 10;
  const totalArc = Math.PI * r;                      // full semi-circle length
  const dashOffset = totalArc * (1 - score / 100);  // hide the unfilled portion from the right end
  const uid = `gauge-${label.replace(/\s/g, "")}`;

  return (
    <svg viewBox="0 0 200 108" className="w-full max-w-[220px]" aria-label={`Score ${score} out of 100`}>
      <defs>
        {/* Gradient runs left-to-right along the arc baseline */}
        <linearGradient id={uid} gradientUnits="userSpaceOnUse" x1="18" y1="100" x2="182" y2="100">
          <stop offset="0%" stopColor={gradStart} />
          <stop offset="100%" stopColor={gradEnd} />
        </linearGradient>
      </defs>
      {/* Track — full semi-circle, split into two quarter-arcs to avoid the degenerate
          diametrically-opposite endpoint issue in SVG */}
      <path
        d={`M 18,100 A ${r},${r} 0 0 1 100,18 A ${r},${r} 0 0 1 182,100`}
        fill="none" stroke="#e2e8f0" strokeWidth={sw} strokeLinecap="round"
      />
      {/* Fill — same path masked with stroke-dashoffset so animation works */}
      <path
        d={`M 18,100 A ${r},${r} 0 0 1 100,18 A ${r},${r} 0 0 1 182,100`}
        fill="none" stroke={`url(#${uid})`} strokeWidth={sw} strokeLinecap="round"
        strokeDasharray={totalArc} strokeDashoffset={dashOffset}
        className="score-ring"
      />
      {/* Score number */}
      <text x="100" y="75" textAnchor="middle" dominantBaseline="middle"
        fontSize="44" fontWeight="800" fontFamily="'DM Mono', monospace" fill={textColor}>
        {score}
      </text>
      {/* /100 label — extra breathing room below score */}
      <text x="100" y="99" textAnchor="middle" dominantBaseline="middle"
        fontSize="11" fontWeight="600" fontFamily="'DM Sans', sans-serif" fill="#94a3b8" letterSpacing="2">
        /100
      </text>
    </svg>
  );
}

function DataRow({ label, value, context }: { label: string; value: string | number; context?: string }) {
  return (
    <div className="py-2 border-b border-slate-100 last:border-0">
      <div className="flex justify-between items-start gap-2">
        <span className="text-xs text-slate-500 leading-snug">{label}</span>
        <span className="text-sm font-bold font-mono text-slate-800 shrink-0">{value}</span>
      </div>
      {context && <div className="text-[10px] text-slate-400 mt-0.5">{context}</div>}
    </div>
  );
}

// ─── Methodology Modal ────────────────────────────────────────────────────────

function MethodologyModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4 modal-backdrop bg-black/30"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-fadein">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <div className="text-lg font-bold text-slate-900">Scoring Methodology</div>
            <div className="text-xs text-slate-500 mt-0.5">How the Neighborhood Health Index is calculated</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 text-lg">×</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5">
            <div className="text-xs font-bold text-blue-800 tracking-wider mb-1">OVERALL FORMULA</div>
            <div className="text-sm font-mono text-blue-900 leading-relaxed">
              Health Index = Safety(25%) + Economic(20%) + Services(20%) + Code(20%) + Community(15%)
            </div>
            <div className="text-xs text-blue-600 mt-2">
              Normalization: Rolling baseline — each district is scored relative to Montgomery&apos;s own city-wide min/max range, making scores immune to macro conditions and seasonal variations.
            </div>
          </div>
          {METHODOLOGY.map(m => (
            <div key={m.key} className="mb-5 border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-3 flex items-center justify-between">
                <div className="font-semibold text-slate-800">{m.icon} {m.label}</div>
                <div className="text-xs font-bold px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-600">{m.weight}% of index</div>
              </div>
              <div className="px-4 py-3">
                <div className="text-xs text-slate-500 mb-2"><span className="font-semibold text-slate-600">Data source:</span> {m.dataSource}</div>
                <div className="mb-2">
                  <div className="text-xs font-semibold text-slate-500 mb-1.5">Sub-factors:</div>
                  <div className="space-y-1">
                    {m.subFactors.map(sf => (
                      <div key={sf.name} className="flex items-center gap-2">
                        <div className="w-full max-w-[120px] h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-400 rounded-full" style={{ width: `${sf.pct}%` }} />
                        </div>
                        <span className="text-xs text-slate-500">{sf.name} <span className="font-semibold text-slate-600">({sf.pct}%)</span></span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="text-xs text-slate-600 italic border-l-2 border-blue-200 pl-2">{m.plain}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Weights Panel ────────────────────────────────────────────────────────────

function WeightsPanel({ weights, onChange, onClose }: {
  weights: ComponentScores;
  onChange: (w: ComponentScores) => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState<ComponentScores>({
    safety: Math.round(weights.safety * 100),
    economic: Math.round(weights.economic * 100),
    services: Math.round(weights.services * 100),
    code: Math.round(weights.code * 100),
    community: Math.round(weights.community * 100),
  } as unknown as ComponentScores);

  const sum = (Object.values(local) as number[]).reduce((a, b) => a + b, 0);
  const valid = sum === 100;

  const update = (key: keyof ComponentScores, val: number) => {
    const next = { ...local, [key]: val } as unknown as ComponentScores;
    setLocal(next);
    const vals = next as unknown as Record<string, number>;
    const s = (Object.values(vals) as number[]).reduce((a, b) => a + b, 0);
    if (s > 0) {
      onChange({
        safety: vals.safety / s,
        economic: vals.economic / s,
        services: vals.services / s,
        code: vals.code / s,
        community: vals.community / s,
      });
    }
  };

  const reset = () => {
    const d = { safety: 25, economic: 20, services: 20, code: 20, community: 15 };
    setLocal(d as unknown as ComponentScores);
    onChange(DEFAULT_WEIGHTS);
  };

  const LABELS: { key: keyof ComponentScores; label: string; icon: string }[] = [
    { key: "safety", label: "Public Safety", icon: "🛡" },
    { key: "economic", label: "Economic Vitality", icon: "📈" },
    { key: "services", label: "City Services", icon: "🏛" },
    { key: "code", label: "Code Compliance", icon: "📋" },
    { key: "community", label: "Community Access", icon: "🏘" },
  ];

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4 modal-backdrop bg-black/30"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fadein">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <div className="text-lg font-bold text-slate-900">Configure Weights</div>
            <div className="text-xs text-slate-500 mt-0.5">Adjust to reflect the city&apos;s current priorities</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 text-lg">×</button>
        </div>
        <div className="px-6 py-4">
          <div className="text-xs text-slate-500 mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
            An IT manager or city administrator can adjust these weights to reflect Montgomery&apos;s current priorities. Scores update in real time. Values are auto-normalized when they don&apos;t sum to 100%.
          </div>
          {LABELS.map(({ key, label, icon }) => {
            const val = (local as unknown as Record<string, number>)[key];
            return (
              <div key={key} className="mb-4">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-sm font-semibold text-slate-700">{icon} {label}</span>
                  <span className="text-sm font-bold font-mono text-slate-800">{val}%</span>
                </div>
                <input type="range" min={0} max={60} value={val}
                  onChange={e => update(key, parseInt(e.target.value))}
                  className="w-full h-2 rounded-full accent-blue-700 cursor-pointer" />
              </div>
            );
          })}
          <div className={`flex items-center justify-between text-sm font-bold mt-2 px-3 py-2 rounded-lg ${valid ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            <span>Total</span>
            <span className="font-mono">{sum}% {valid ? "✓" : `— ${sum > 100 ? "over" : "under"} by ${Math.abs(sum - 100)}%`}</span>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={reset} className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">Reset to defaults</button>
            <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-blue-800 text-white text-sm font-semibold hover:bg-blue-700 transition-colors">Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [apiData, setApiData] = useState<DistrictData[]>([]);
  const [weights, setWeights] = useState<ComponentScores>(DEFAULT_WEIGHTS);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [view, setView] = useState<"map" | "ranking">("map");
  const [briefing, setBriefing] = useState<AIBriefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState("");
  const [fetchedAt, setFetchedAt] = useState("");
  const [crimeSource, setCrimeSource] = useState<"live" | "unavailable" | "">("");
  const [showMethodology, setShowMethodology] = useState(false);
  const [showWeights, setShowWeights] = useState(false);
  const [expandedComponent, setExpandedComponent] = useState<keyof ComponentScores | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const districtLayersRef = useRef<Map<number, any>>(new Map());
  const scoreMarkersRef = useRef<Map<number, any>>(new Map());
  // Ref so Leaflet hover closures always read current selection without stale capture
  const selectedIdRef = useRef<number | null>(null);

  // ── Derived: re-score with custom weights ──────────────
  const districtData = useMemo((): DistrictData[] => {
    return apiData.map(({ district, raw }) => ({
      district,
      raw,
      scores: calculateDistrictScores(raw, district.population, weights),
    }));
  }, [apiData, weights]);

  // ── Fetch data ─────────────────────────────────────────
  useEffect(() => {
    fetch("/api/scores")
      .then(r => r.json())
      .then(res => {
        setApiData(res.data);
        setDataSource(res.source);
        setFetchedAt(res.fetchedAt);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    fetch("/api/crimes")
      .then(r => r.json())
      .then(res => setCrimeSource(res.available ? "live" : "unavailable"))
      .catch(() => setCrimeSource("unavailable"));
  }, []);

  // ── Helper: build score circle icon ───────────────────
  const makeScoreIcon = useCallback((L: any, score: number, distId: number) => {
    const scoreColor = getScoreColor(score);
    return L.divIcon({
      className: "",
      iconSize: [58, 58],
      iconAnchor: [29, 29],
      html: `<div class="score-circle-marker" style="width:58px;height:58px;border-radius:50%;background:white;border:3.5px solid ${scoreColor};box-shadow:0 2px 14px rgba(0,0,0,0.22),0 0 0 2px white;display:flex;align-items:center;justify-content:center;flex-direction:column;cursor:pointer;font-family:'DM Mono',monospace;position:relative">
        <div style="font-size:18px;font-weight:800;color:${scoreColor};line-height:1">${score}</div>
        <div style="font-size:8px;font-weight:700;color:#64748b;letter-spacing:0.06em;margin-top:1px">D${distId}</div>
      </div>`,
    });
  }, []);

  // ── Initialize map ─────────────────────────────────────
  useEffect(() => {
    if (view !== "map" || mapInstance.current || districtData.length === 0 || typeof window === "undefined") return;

    const initMap = async () => {
      const L = (await import("leaflet")).default;
      if (!mapRef.current || mapInstance.current) return;

      // Create separate panes so polygons render below markers
      const map = L.map(mapRef.current, { center: [32.366, -86.28], zoom: 12, zoomControl: false });
      map.createPane("districtPane");
      map.getPane("districtPane")!.style.zIndex = "350";
      map.createPane("labelPane");
      map.getPane("labelPane")!.style.zIndex = "380";
      map.createPane("scorePane");
      map.getPane("scorePane")!.style.zIndex = "400";

      // CartoDB Positron — clean light tiles
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a> | Montgomery Open Data',
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Computed centroids from actual GeoJSON polygon geometry
      const computedCentroids = new Map<number, [number, number]>();

      // Fetch district GeoJSON boundaries
      try {
        const geoRes = await fetch(
          "https://services7.arcgis.com/xNUwUjOJqYE54USz/arcgis/rest/services/Council_District_2024/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson"
        );
        const geoJson = await geoRes.json();

        // Draw district polygons with FIXED colors (not score-based)
        L.geoJSON(geoJson, {
          pane: "districtPane",
          style: (feature) => {
            const distId: number = feature?.properties?.Id ?? feature?.properties?.DISTRICT_I ?? 0;
            const distColor = DISTRICT_COLORS[distId] ?? "#64748b";
            return {
              fillColor: distColor,
              fillOpacity: 0.30,
              color: distColor,
              weight: 2.5,
              opacity: 0.85,
              pane: "districtPane",
            };
          },
          onEachFeature: (feature, layer) => {
            const distId: number = feature?.properties?.Id ?? feature?.properties?.DISTRICT_I ?? 0;
            const dd = districtData.find(d => d.district.id === distId);
            if (!dd) return;

            districtLayersRef.current.set(distId, layer);

            // Compute centroid from actual polygon bounds
            try {
              const bounds = (layer as any).getBounds();
              const c = bounds.getCenter();
              computedCentroids.set(distId, [c.lat, c.lng]);
            } catch { /* fall back to hardcoded center */ }

            layer.on("click", () => { setSelectedId(distId); setBriefing(null); });

            // Hover: subtle fill/stroke lift — only when not selected
            layer.on("mouseover", () => {
              if (selectedIdRef.current !== distId) {
                (layer as any).setStyle({ fillOpacity: 0.48, weight: 4.0, opacity: 1.0 });
              }
            });
            layer.on("mouseout", () => {
              if (selectedIdRef.current !== distId) {
                (layer as any).setStyle({ fillOpacity: 0.28, weight: 2.5, opacity: 0.85 });
              }
            });
          },
        }).addTo(map);
      } catch {
        console.warn("GeoJSON boundary fetch failed — score markers only");
      }

      // Score circles: use computed polygon centroids, fall back to hardcoded district.center
      districtData.forEach(({ district, scores }) => {
        const position: [number, number] =
          MARKER_OVERRIDES[district.id] ??
          computedCentroids.get(district.id) ??
          (district.center as [number, number]);
        const icon = makeScoreIcon(L, scores.overall, district.id);
        const marker = L.marker(position, { icon, pane: "scorePane" })
          .addTo(map)
          .on("click", () => { setSelectedId(district.id); setBriefing(null); });
        scoreMarkersRef.current.set(district.id, { marker, L });
      });

      mapInstance.current = map;
    };

    initMap();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, districtData]);

  // ── Update score circles when weights change ───────────
  useEffect(() => {
    if (!mapInstance.current) return;
    districtData.forEach(({ district, scores }) => {
      const entry = scoreMarkersRef.current.get(district.id);
      if (!entry) return;
      const { marker, L } = entry;
      marker.setIcon(makeScoreIcon(L, scores.overall, district.id));
    });
  }, [districtData, makeScoreIcon]);

  // ── Reset briefing when district changes ──────────────
  useEffect(() => {
    selectedIdRef.current = selectedId;
    setBriefing(null);
    setBriefingLoading(false);
    setExpandedComponent(null);

    // Update polygon visual state: selected vs default
    districtLayersRef.current.forEach((layer, id) => {
      if (id === selectedId) {
        layer.setStyle({ fillOpacity: 0.55, weight: 4.5, opacity: 1.0 });
        layer.bringToFront?.();
      } else {
        layer.setStyle({ fillOpacity: 0.28, weight: 2.5, opacity: 0.85 });
      }
    });
  }, [selectedId]);

  const handleViewChange = useCallback((v: "map" | "ranking") => {
    setView(v);
    if (v === "map" && mapInstance.current) {
      setTimeout(() => mapInstance.current?.invalidateSize(), 100);
    }
  }, []);

  const selected = selectedId ? districtData.find(d => d.district.id === selectedId) : null;
  const cityAvg = districtData.length > 0
    ? Math.round(districtData.reduce((s, d) => s + d.scores.overall, 0) / districtData.length) : 0;
  const sorted = [...districtData].sort((a, b) => a.scores.overall - b.scores.overall);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-800 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <div className="text-slate-500 font-semibold">Loading Montgomery data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex flex-col bg-slate-50">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="bg-[#1e3a5f] text-white px-4 md:px-6 py-3 flex items-center justify-between gap-2 shadow-md shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 shrink-0 rounded-lg bg-white/15 flex items-center justify-center text-lg font-bold">◉</div>
          <div className="min-w-0">
            <div className="text-base font-bold tracking-tight leading-tight">NeighborhoodPulse</div>
            <div className="hidden sm:block text-[10px] text-blue-200 tracking-widest font-medium">MONTGOMERY, AL — COMMUNITY HEALTH INTELLIGENCE DASHBOARD</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {/* Data source badge */}
          {dataSource === "mock"
            ? <span className="text-[10px] px-2 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30">DEMO DATA</span>
            : dataSource === "live-partial"
            ? <span className="text-[10px] px-2 py-1 rounded bg-blue-400/20 text-blue-200 border border-blue-300/30 hidden sm:inline">LIVE · PARTIAL</span>
            : dataSource === "live"
            ? <span className="text-[10px] px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">● LIVE DATA</span>
            : null}
          {crimeSource === "live" && (
            <span className="text-[10px] px-2 py-1 rounded bg-purple-400/20 text-purple-200 border border-purple-300/30 hidden sm:inline">✦ BRIGHT DATA</span>
          )}
          {/* City average */}
          <div className="px-2.5 py-1.5 rounded-lg bg-white/10 text-xs font-semibold whitespace-nowrap">
            City Avg: <span className="font-mono font-bold" style={{ color: getScoreColor(cityAvg) }}>{cityAvg}</span>
            <span className="text-blue-300">/100</span>
          </div>
          {/* Action buttons */}
          <button onClick={() => setShowWeights(true)}
            className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold transition-colors">
            ⚖ Weights
          </button>
          <button onClick={() => setShowMethodology(true)}
            className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold transition-colors">
            ℹ Methodology
          </button>
          {/* View toggle */}
          <div className="flex gap-0.5 bg-white/10 rounded-lg p-0.5">
            {(["map", "ranking"] as const).map(v => (
              <button key={v} onClick={() => handleViewChange(v)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide transition-all ${view === v ? "bg-white text-[#1e3a5f]" : "text-blue-200 hover:text-white"}`}>
                {v === "map" ? "◉ Map" : "☰ List"}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">

        {/* Left: map or ranking — map always stays in DOM so Leaflet doesn't break */}
        <div className="flex-1 relative min-h-[45vh] md:min-h-0">
          {/* Map — hidden via CSS when list view is active */}
          <div style={{ display: view === "map" ? "block" : "none" }} className="w-full h-full absolute inset-0 z-0">
            <div ref={mapRef} className="w-full h-full" />
              {/* Legend: district colors */}
              <div className="absolute top-3 right-3 bg-white/96 backdrop-blur-sm rounded-xl shadow-lg p-3 border border-slate-200 z-[1000] max-h-[calc(100%-24px)] overflow-y-auto">
                <div className="text-[9px] font-bold text-slate-400 tracking-widest mb-2">COUNCIL DISTRICTS</div>
                {districtData.map(({ district }) => (
                  <div key={district.id}
                    onClick={() => { setSelectedId(district.id); setBriefing(null); }}
                    className="flex items-center gap-2 mb-1.5 cursor-pointer hover:opacity-80 transition-opacity">
                    <div className="w-3 h-3 rounded-sm shrink-0 border border-white/50"
                      style={{ backgroundColor: DISTRICT_COLORS[district.id] ?? "#64748b" }} />
                    <span className="text-[10px] text-slate-600 font-medium leading-tight">
                      D{district.id} — {district.area.split("/")[0].trim()}
                    </span>
                  </div>
                ))}
              </div>
              {/* Legend: health score circles */}
              <div className="absolute bottom-5 left-4 bg-white/96 backdrop-blur-sm rounded-xl shadow-lg p-3 border border-slate-200 z-[1000]">
                <div className="text-[9px] font-bold text-slate-400 tracking-widest mb-1.5">HEALTH SCORE CIRCLES</div>
                <div className="text-[9px] text-slate-400 mb-2 leading-snug">Score 0–100 · Higher is better</div>
                {[
                  { l: "75+ Thriving", c: "#059669" },
                  { l: "60–74 Stable", c: "#0d9488" },
                  { l: "45–59 Watch", c: "#d97706" },
                  { l: "30–44 At Risk", c: "#ea580c" },
                  { l: "0–29 Critical", c: "#dc2626" },
                ].map(({ l, c }) => (
                  <div key={l} className="flex items-center gap-2 mb-1">
                    <div className="w-3.5 h-3.5 rounded-full border-2 shrink-0 bg-white"
                      style={{ borderColor: c }} />
                    <span className="text-[10px] text-slate-600 font-medium">{l}</span>
                  </div>
                ))}
                <div className="text-[9px] text-slate-400 mt-2 border-t border-slate-100 pt-2">Click any district to explore</div>
              </div>
          </div>
          {/* List view — solid white, completely covers the map */}
          {view === "ranking" && (
            <div className="absolute inset-0 bg-white overflow-y-auto p-4 md:p-5 z-10">
              <div className="text-xs font-bold text-slate-400 tracking-widest mb-1">DISTRICT HEALTH RANKING</div>
              <div className="text-xs text-slate-400 mb-4">Neighborhood Health Index — Score out of 100</div>
              {sorted.map(({ district, scores }, i) => (
                <div key={district.id}
                  onClick={() => { setSelectedId(district.id); setBriefing(null); }}
                  className={`flex items-center gap-4 px-4 py-3 mb-2 rounded-xl cursor-pointer border transition-all ${selectedId === district.id ? "border-blue-300 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"}`}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold font-mono shrink-0"
                    style={{ backgroundColor: scores.overall < 45 ? "#fee2e2" : "#f1f5f9", color: scores.overall < 45 ? "#dc2626" : "#64748b" }}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800">{district.name} — {district.area}</div>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {([
                        { k: "SAF", v: scores.safety },
                        { k: "ECO", v: scores.economic },
                        { k: "SVC", v: scores.services },
                        { k: "COD", v: scores.code },
                        { k: "COM", v: scores.community },
                      ]).map(({ k, v }) => (
                        <span key={k} className="text-[10px] font-mono font-semibold" style={{ color: getScoreColor(v) }}>
                          {k} {v}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-2xl font-extrabold font-mono shrink-0" style={{ color: getScoreColor(scores.overall) }}>
                    {scores.overall}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: district detail sidebar */}
        <div className="w-full md:w-[390px] border-t md:border-t-0 md:border-l border-slate-200 overflow-y-auto bg-white flex-shrink-0">
          {selected ? (
            <div className="p-5 animate-fadein">
              {/* District Health Summary Card */}
              <div className="mb-5 bg-white rounded-xl pt-5 pb-4 px-5 border border-slate-200 shadow-sm text-center">
                {/* District name + meta */}
                <div className="text-base font-bold text-slate-900 leading-tight">{selected.district.name}</div>
                <div className="text-xs text-slate-400 mt-0.5 mb-3">
                  {selected.district.area} &middot; Pop.&nbsp;{selected.district.population.toLocaleString()}
                </div>

                {/* Semi-circle gauge */}
                <div className="flex justify-center">
                  <SemiGauge score={selected.scores.overall} label={selected.scores.label} />
                </div>

                {/* Section label */}
                <div className="text-[10px] font-bold text-slate-400 tracking-widest -mt-1 mb-3">
                  DISTRICT HEALTH INDEX
                </div>

                {/* Status badge + trend */}
                <div className="flex items-center justify-center gap-2.5 flex-wrap mb-2">
                  {/* Premium pill badge */}
                  <span className={`text-xs font-bold px-3.5 py-1 rounded-full ${BADGE_STYLES[selected.scores.label]}`}>
                    {selected.scores.label}
                  </span>
                  {/* Trend — preserved exactly */}
                  {(() => {
                    const prior = selected.raw.priorOverallScore;
                    let up: boolean;
                    let pct: string;
                    if (prior > 0) {
                      const delta = ((selected.scores.overall - prior) / prior) * 100;
                      up = delta >= 0;
                      pct = Math.abs(delta).toFixed(1);
                    } else {
                      const tr = selected.scores.trends;
                      const wt = tr.safety * 0.25 + tr.economic * 0.20 + tr.services * 0.20 + tr.code * 0.20 + tr.community * 0.15;
                      if (Math.abs(wt) < 0.005) return null;
                      up = wt > 0;
                      pct = (Math.abs(wt) * 100).toFixed(1);
                    }
                    return (
                      <div className="text-xs font-semibold flex items-center gap-1"
                        style={{ color: up ? "#059669" : "#dc2626" }}>
                        {up ? "▲" : "▼"} {pct}% vs. prior quarter
                      </div>
                    );
                  })()}
                </div>

              </div>

              {/* Council Briefing — unified card (button + result) */}
              <div className="mb-4 rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="text-[10px] font-bold text-slate-400 tracking-widest">COUNCIL BRIEFING</div>
                  {!briefingLoading && briefing && (
                    <button onClick={() => {
                      if (!selected) return;
                      setBriefing(null);
                      setBriefingLoading(true);
                      fetch("/api/briefing", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ district: selected.district, scores: selected.scores, raw: selected.raw }),
                      }).then(r => r.json()).then(d => setBriefing(d.briefing)).catch(console.error).finally(() => setBriefingLoading(false));
                    }} className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold">↺ Regenerate</button>
                  )}
                </div>
                <div className="px-4 py-3.5">
                  {briefingLoading ? (
                    <div className="space-y-2 animate-pulse py-1">
                      <div className="flex items-center gap-2.5 mb-3">
                        <div className="w-3.5 h-3.5 border-2 border-blue-700 border-t-transparent rounded-full animate-spin shrink-0" />
                        <span className="text-xs text-slate-500 font-medium">Generating briefing…</span>
                      </div>
                      <div className="h-3 bg-slate-100 rounded-full w-full" />
                      <div className="h-3 bg-slate-100 rounded-full w-5/6" />
                      <div className="h-3 bg-slate-100 rounded-full w-4/6" />
                      <div className="h-3 bg-slate-100 rounded-full w-full mt-3" />
                      <div className="h-3 bg-slate-100 rounded-full w-3/4" />
                    </div>
                  ) : briefing ? (
                    <div className="animate-fadein">
                      {briefing.alert && (
                        <div className={`p-2.5 rounded-lg text-[11px] font-semibold mb-3 animate-pulse-glow ${briefing.alert.includes("PRIORITY") ? "bg-red-50 border border-red-200 text-red-700" : "bg-amber-50 border border-amber-200 text-amber-700"}`}>
                          {briefing.alert}
                        </div>
                      )}
                      <div className="text-[10px] font-bold text-slate-400 tracking-widest mb-1.5">OVERVIEW</div>
                      <p className="text-xs text-slate-600 leading-relaxed mb-3">{briefing.summary}</p>
                      <div className="text-[10px] font-bold text-slate-400 tracking-widest mb-1.5">RECOMMENDATION</div>
                      <p className="text-xs text-slate-700 leading-relaxed mb-3">{briefing.recommendation}</p>
                      {briefing.actions && briefing.actions.length > 0 && (
                        <>
                          <div className="text-[10px] font-bold text-slate-400 tracking-widest mb-1.5">SUGGESTED ACTIONS</div>
                          <ol className="space-y-2">
                            {briefing.actions.map((a, i) => (
                              <li key={i} className="flex gap-2 text-xs text-slate-700 leading-snug">
                                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                                <span>{a}</span>
                              </li>
                            ))}
                          </ol>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      <button onClick={() => {
                        if (!selected) return;
                        setBriefingLoading(true);
                        fetch("/api/briefing", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ district: selected.district, scores: selected.scores, raw: selected.raw }),
                        }).then(r => r.json()).then(d => setBriefing(d.briefing)).catch(console.error).finally(() => setBriefingLoading(false));
                      }} className="w-full py-3 bg-gradient-to-br from-sky-600 via-blue-600 to-indigo-700 hover:from-sky-500 hover:via-blue-500 hover:to-indigo-600 text-white text-xs font-semibold rounded-xl shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2">
                        ✦ Generate Council Briefing
                      </button>
                      <div className="text-[10px] text-slate-400 text-center leading-snug">
                        AI-powered analysis of district trends, risks, and recommended actions.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Component scores — click any row to expand breakdown */}
              <div className="bg-white rounded-xl px-4 pt-4 pb-2 mb-4 border border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[10px] font-bold text-slate-400 tracking-widest">COMPONENT SCORES</div>
                  <div className="text-[10px] text-slate-400">Click row to expand ▸</div>
                </div>
                {([
                  { key: "safety" as const, label: "Public Safety", icon: "🛡", score: selected.scores.safety, trend: selected.scores.trends.safety },
                  { key: "economic" as const, label: "Economic Vitality", icon: "📈", score: selected.scores.economic, trend: selected.scores.trends.economic },
                  { key: "services" as const, label: "City Services", icon: "🏛", score: selected.scores.services, trend: selected.scores.trends.services },
                  { key: "code" as const, label: "Code Compliance", icon: "📋", score: selected.scores.code, trend: selected.scores.trends.code },
                  { key: "community" as const, label: "Community Access", icon: "🏘", score: selected.scores.community, trend: selected.scores.trends.community },
                ]).map(c => (
                  <ComponentScoreRow key={c.key}
                    label={c.label} score={c.score} icon={c.icon} trend={c.trend}
                    componentKey={c.key} raw={selected.raw} population={selected.district.population}
                    expanded={expandedComponent === c.key}
                    onToggle={() => setExpandedComponent(prev => prev === c.key ? null : c.key)}
                  />
                ))}
                <div className="text-[10px] text-slate-400 mt-2 border-t border-slate-100 pt-2">▲/▼ = score trend vs. prior period · &gt;10% decline highlighted in red</div>
              </div>

              {/* Source data */}
              <div className="bg-white rounded-xl p-4 mb-4 border border-slate-200">
                <div className="text-[10px] font-bold text-slate-400 tracking-widest mb-1">SOURCE DATA</div>
                <DataRow label="Fire/EMS Incidents (90d)"
                  value={selected.raw.fireResponseCount90d}
                  context={`Prev. 90d: ${selected.raw.fireResponseCountPrev90d} · ${selected.raw.fireResponseCount90d > selected.raw.fireResponseCountPrev90d ? "↑" : "↓"} ${Math.abs(((selected.raw.fireResponseCount90d - selected.raw.fireResponseCountPrev90d) / Math.max(1, selected.raw.fireResponseCountPrev90d)) * 100).toFixed(1)}% vs. prior quarter`} />
                <DataRow label="Env. Nuisance Reports (90d)"
                  value={selected.raw.nuisanceCount90d}
                  context="Reports of blight, illegal dumping, or code-adjacent nuisance conditions" />
                <DataRow label="Construction Permits (180d)"
                  value={selected.raw.permits180d}
                  context={`${selected.raw.permitsNewConstruction} new construction · ${selected.raw.permits180d - selected.raw.permitsNewConstruction} renovation/other`} />
                <DataRow label="New Business Licenses"
                  value={selected.raw.bizLicensesNew}
                  context={`${selected.raw.bizLicensesActive} active licenses in district`} />
                <DataRow label="311 Service Requests"
                  value={`${selected.raw.requests311Total} total`}
                  context={`${selected.raw.requests311Resolved} resolved (${selected.raw.requests311Total > 0 ? ((selected.raw.requests311Resolved / selected.raw.requests311Total) * 100).toFixed(0) : 0}% rate) · Avg ${selected.raw.avgResolutionDays} days to close`} />
                <DataRow label="Open Code Violations"
                  value={selected.raw.codeViolationsOpen}
                  context={`${(selected.raw.codeViolationsClosedRate * 100).toFixed(0)}% closure rate · Unresolved violations signal visible deterioration`} />
                <DataRow label="Community Resources"
                  value={`${selected.raw.parks}P · ${selected.raw.communityCenters}CC · ${selected.raw.fireStations + selected.raw.policeStations}EMS`}
                  context={`Parks · Community Centers · Emergency Stations · ${selected.raw.schools} schools · ${selected.raw.pharmacies} pharmacies · ${selected.raw.shelters} shelters`} />
              </div>

            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-10 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-2xl mb-4 text-slate-300">◉</div>
              <div className="text-sm font-semibold text-slate-500 mb-2">Select a District</div>
              <div className="text-xs text-slate-400 leading-relaxed max-w-[200px]">Click any district on the map or use the ranking list to explore health data and AI briefings.</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="px-4 md:px-6 py-2 border-t border-slate-200 bg-white flex justify-between items-center text-[10px] text-slate-400 gap-2 shrink-0">
        <span className="hidden md:inline">
          <span className="text-blue-700 font-semibold">ArcGIS:</span> Permits · Licenses · 311 · Code Violations · Fire/EMS · Stations · Parks · Schools
          {crimeSource === "live" && <span> · <span className="text-purple-600 font-semibold">Bright Data:</span> CrimeMapping.com</span>}
        </span>
        <span className="md:hidden text-blue-600 font-semibold">ArcGIS Open Data · Montgomery, AL</span>
        <span className="shrink-0">{fetchedAt ? `Updated ${new Date(fetchedAt).toLocaleTimeString()}` : ""}</span>
      </footer>

      {/* ── Modals ──────────────────────────────────────────── */}
      {showMethodology && <MethodologyModal onClose={() => setShowMethodology(false)} />}
      {showWeights && (
        <WeightsPanel
          weights={weights}
          onChange={setWeights}
          onClose={() => setShowWeights(false)}
        />
      )}
    </div>
  );
}
