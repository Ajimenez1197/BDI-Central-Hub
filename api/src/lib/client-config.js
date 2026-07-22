/**
 * client-config.js — Per-client reporting configuration for the Central Hub.
 *
 * Currently this holds the Appeal-code-length table used by the Client Service
 * Blue Book report (and its appeal dropdown). It mirrors the reference table
 * maintained in the Data Hub; keep the two in sync when a client's code length
 * changes.
 */

/**
 * APPEAL_CODE_LENGTH — the per-client N in LEFT(Appeal_ID, N).
 * ─────────────────────────────────────────────────────────────────────────────
 * This is the hand-maintained reference table for how many leading Appeal_ID
 * characters make up the campaign code (the value grouped in the appeal dropdown
 * and joined against AS_CampCode). N is chosen so LEFT(Appeal_ID, N) reproduces
 * the Campaign_ID grouping: deep enough to keep different PACKAGES apart, shallow
 * enough to collapse Segment_ID (control/test) splits.
 *
 * BDI standard is 7 (Appeal_ID = type·YY·MM·package·seg). Clients NOT listed here
 * default to 7 — only add an entry when a client deviates. Update by hand.
 *
 * ⚠ = imperfect proxy: even the best-fit N still merges multiple distinct
 * campaigns under a shared prefix (their appeal numbering shifts year to year,
 * so package isn't at a fixed character position). For these, prefer grouping on
 * Campaign_ID directly if package-level accuracy matters. GFRM is the same case
 * but its best fit is the default 7, so it isn't listed — flagged here only.
 *   Flagged: GFRM (7), KCCU (5), BRM (5), CASM (8), TWC (5).
 */
const APPEAL_CODE_LENGTH = {
  // Deeper than standard — package/version sits further into the code
  RMMV: 10, // "A-99920-0199": the dash pushes the package digit to pos 10 (LEFT 7 & 9 both merge Note vs Dinner Kit)
  KARM: 9, //  "NC2511XDB-04": package code at pos 8–9, before the "-" segment
  CASM: 8, //  ⚠ "2512END2910": theme-code format; best fit but still merges ~19 campaigns — verify by hand

  // Shorter than standard
  CSMM: 6,
  BLM: 5,
  PDXM: 5, //  keys on first 5 (QP·YYMM)
  RRM: 5,
  TWC: 5, //   keys on first 5
  BRM: 5, //   ⚠ LEFT(5) still merges ~25 campaigns; consider Campaign_ID
  KCCU: 5, //  ⚠ LEFT(5) still merges ~36 campaigns; consider Campaign_ID
};

/**
 * Number of leading Appeal_ID characters that make up the campaign code.
 * Reads the APPEAL_CODE_LENGTH table above; falls back to the BDI standard of 7.
 */
export function getAppealCodeLength(clientId) {
  const id = clientId?.toUpperCase();
  const len = APPEAL_CODE_LENGTH[id];
  return Number.isInteger(len) ? len : 7;
}
