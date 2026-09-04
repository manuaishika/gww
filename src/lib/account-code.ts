/**
 * Account codes (spec §6). Six characters, shown as `K7M-2QX`. The alphabet
 * drops the ambiguous glyphs (0/O, 1/I/L, etc.) so a code read off one screen
 * types cleanly into another. 6 chars over a 28-symbol alphabet ≈ 480M codes.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0 1 I L O

export function generateAccountCode(): string {
  let raw = "";
  for (let i = 0; i < 6; i++) {
    raw += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `${raw.slice(0, 3)}-${raw.slice(3)}`;
}

/** Accepts `k7m2qx`, `K7M-2QX`, `k7m 2qx` → canonical `K7M-2QX`, or null. */
export function normalizeAccountCode(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (cleaned.length !== 6) return null;
  for (const ch of cleaned) if (!ALPHABET.includes(ch)) return null;
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
}
