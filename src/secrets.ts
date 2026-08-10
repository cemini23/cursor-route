/**
 * Secret material detectors — match key *contents*, not the phrase "API key".
 * Applied to `start` and `send`.
 */
const PATTERNS: RegExp[] = [
  /\bsk-[a-zA-Z0-9]{20,}\b/,
  /\bghp_[A-Za-z0-9]{20,}\b/,
  /\bgho_[A-Za-z0-9]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/i,
  /\bAIza[0-9A-Za-z_-]{20,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
];

export function looksLikeSecretMaterial(text: string): boolean {
  return PATTERNS.some((re) => re.test(text));
}

export const JOB_ID_RE = /^[a-f0-9]{8}$/;

export function assertJobId(id: string): string {
  if (!JOB_ID_RE.test(id)) {
    throw new Error(`Invalid job id: ${id} (expected 8 hex chars)`);
  }
  return id;
}
