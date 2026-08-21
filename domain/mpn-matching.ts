/** Strips everything but letters/digits and upcases, so "ESP32-WROOM-32" and "esp32_wroom_32e" compare sanely. */
export function fold(mpn: string): string {
  return mpn.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * A real tracked MPN if `mpn` names the same part (ignoring case/punctuation) or an
 * unambiguous prefix/suffix of one - "ESP32-WROOM-32" should count as a match for the
 * tracked "ESP32-WROOM-32E" even though an exact-string match against the provided list
 * would miss it.
 */
export function findTrackedEquivalent(mpn: string, foldedTracked: Map<string, string>): string | null {
  const target = fold(mpn);
  if (!target) return null;
  if (foldedTracked.has(target)) return foldedTracked.get(target)!;
  for (const [folded, real] of foldedTracked) {
    if (folded.startsWith(target) || target.startsWith(folded)) return real;
  }
  return null;
}

/** Builds the fold -> real-MPN lookup `findTrackedEquivalent` needs, once per reconciliation pass. */
export function buildFoldedTrackedIndex(trackedMpns: Set<string>): Map<string, string> {
  return new Map([...trackedMpns].map((mpn) => [fold(mpn), mpn]));
}
