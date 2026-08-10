/**
 * Secret material detectors — match key *contents*, not the phrase "API key".
 * Applied to `start` and `send`, and reused for log-tail redaction.
 */
export const SECRET_PATTERNS: RegExp[] = [
  // OpenAI / DeepSeek legacy + project / Anthropic hyphenated keys
  /\bsk-[a-zA-Z0-9]{20,}\b/,
  /\bsk-(?:proj|ant|oai)-[A-Za-z0-9_-]{16,}\b/,
  /\bsk-[a-zA-Z0-9-]{20,}\b/,
  /\bghp_[A-Za-z0-9]{20,}\b/,
  /\bgho_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/i,
  /\bxai-[A-Za-z0-9_-]{20,}\b/,
  /\bAIza[0-9A-Za-z_-]{20,}\b/,
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+/i,
];

export function looksLikeSecretMaterial(text: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(text));
}

/** Redact secret-looking spans for job metadata / log tails. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) {
    // Clone with global flag so we replace all matches
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    out = out.replace(new RegExp(re.source, flags), "[REDACTED]");
  }
  return out;
}

export const JOB_ID_RE = /^[a-f0-9]{8}$/;

export function assertJobId(id: string): string {
  if (!JOB_ID_RE.test(id)) {
    throw new Error(`Invalid job id: ${id} (expected 8 hex chars)`);
  }
  return id;
}
