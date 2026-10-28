// Accept a single station identifier, not prose or a list of stations.
// This is a plausibility check, not verification of an issued radio licence.
export function sanitizeCallsign(selection) {
  if (typeof selection !== "string" || selection.length > 120) return null;
  const value = selection.normalize("NFKC").trim().toUpperCase()
    .replace(/^[\s\[\](){},.;:!?"'“”‘’<>]+|[\s\[\](){},.;:!?"'“”‘’<>]+$/g, "")
    .replace(/\s*\/\s*/g, "/");
  if (!/^[A-Z0-9]+(?:\/[A-Z0-9]+){0,3}$/.test(value) || value.length > 30) return null;
  // An ordinary base call contains a digit and ends in one or more letters.
  // Prefixes/suffixes allow e.g. EA8/KF6UFO, KF6UFO/P, W1AW/7, 3DA0ABC.
  const parts = value.split("/");
  if (parts.some(part => part.length > 12)) return null;
  if (!parts.some(part => /^(?=[A-Z0-9]*[A-Z])[A-Z0-9]{1,6}[0-9][A-Z]{1,6}$/.test(part))) return null;
  return value;
}
