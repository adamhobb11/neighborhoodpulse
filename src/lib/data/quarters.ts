/**
 * Quarter key utilities for NeighborhoodPulse historical snapshot system.
 *
 * Quarter keys use the format 'YYYY-QN' (e.g. '2026-Q2').
 * Q1 = Jan–Mar, Q2 = Apr–Jun, Q3 = Jul–Sep, Q4 = Oct–Dec.
 */

/** Returns the calendar quarter key for a given date, defaulting to today. */
export function getQuarterKey(date: Date = new Date()): string {
  const q = Math.ceil((date.getMonth() + 1) / 3);
  return `${date.getFullYear()}-Q${q}`;
}

/**
 * Returns the key for the calendar quarter immediately preceding the given date.
 * Correctly wraps from Q1 of one year to Q4 of the prior year.
 */
export function getPriorQuarterKey(date: Date = new Date()): string {
  const q = Math.ceil((date.getMonth() + 1) / 3);
  if (q === 1) return `${date.getFullYear() - 1}-Q4`;
  return `${date.getFullYear()}-Q${q - 1}`;
}

/**
 * Calculate a true quarter-over-quarter trend fraction.
 *
 * Returns a signed fraction where:
 *   positive = score improved vs prior quarter
 *   negative = score declined vs prior quarter
 *   0        = no change or prior score is 0 (division guard)
 *
 * Uses the same unit as DistrictScores.trends.* so existing UI
 * rendering (▲/▼ X%) works without modification.
 */
export function calcQoQTrend(current: number, prior: number): number {
  if (prior === 0) return 0;
  return (current - prior) / prior;
}
