/**
 * Public-safe competition aliases: Adjective + Noun + 2 digits.
 * Generated once at profile creation; not derived from UUID or PII.
 */

export const ALIAS_ADJECTIVES = [
  "Rapid",
  "Quiet",
  "Blue",
  "Keen",
  "Bold",
  "Calm",
  "Bright",
  "Swift",
  "Solid",
  "Lucky",
  "Clever",
  "Steady",
  "Nimble",
  "Sharp",
  "Brave",
  "Cool",
  "Prime",
  "Clear",
  "Grand",
  "Noble",
] as const;

export const ALIAS_NOUNS = [
  "Otter",
  "Falcon",
  "Kernel",
  "Packet",
  "Relay",
  "Cache",
  "Router",
  "Beacon",
  "Signal",
  "Pixel",
  "Circuit",
  "Vector",
  "Spark",
  "Forge",
  "Harbor",
  "Comet",
  "Cedar",
  "Nova",
  "Atlas",
  "Quill",
] as const;

const ALIAS_PATTERN = /^[A-Z][a-z]+[A-Z][a-z]+[0-9]{2}$/;

export function isValidAliasFormat(alias: string): boolean {
  return ALIAS_PATTERN.test(alias);
}

/** Builds one candidate alias. Callers must persist and handle uniqueness. */
export function generateAlias(random: () => number = Math.random): string {
  const adjective = ALIAS_ADJECTIVES[Math.floor(random() * ALIAS_ADJECTIVES.length)]!;
  const noun = ALIAS_NOUNS[Math.floor(random() * ALIAS_NOUNS.length)]!;
  const digits = String(Math.floor(random() * 100)).padStart(2, "0");
  return `${adjective}${noun}${digits}`;
}

export const ALIAS_INSERT_MAX_ATTEMPTS = 8;
