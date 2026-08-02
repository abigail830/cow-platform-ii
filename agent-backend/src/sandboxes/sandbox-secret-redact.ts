/** Redact secrets from sandbox bash stdout/stderr before they reach the agent UI. */
export function redactSandboxSecrets(text: string): string {
  if (!text) return text;
  return text
    .replace(/okf_[A-Za-z0-9_-]{8,}/g, 'okf_[REDACTED]')
    .replace(/(Authorization:\s*Bearer\s+)okf_[^\s"'\\]+/gi, '$1okf_[REDACTED]')
    .replace(/OPENKMS_API_KEY=(?!set\b|""|''|\s*$)[^\s\n"']+/g, 'OPENKMS_API_KEY=[REDACTED]');
}
