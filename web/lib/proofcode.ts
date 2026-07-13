import { randomBytes } from "crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const LEN = 20;

const CANON: Record<string, string> = { I: "1", L: "1", O: "0", U: "V" };

export function makeProofCode(): string {
  const out: string[] = [];
  while (out.length < LEN) {
    const buf = randomBytes(LEN);
    for (let i = 0; i < buf.length && out.length < LEN; i++) {
      out.push(ALPHABET[buf[i] & 31]);
    }
  }
  return out.join("");
}

export function canonicalizeProofCode(input: string): string | null {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .split("")
    .map((c) => CANON[c] ?? c)
    .join("");
  if (cleaned.length !== LEN) return null;
  if (![...cleaned].every((c) => ALPHABET.includes(c))) return null;
  return cleaned;
}

export function formatProofCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, "$1-");
}

export async function uniqueProofCode(exists: (code: string) => Promise<boolean>): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = makeProofCode();
    if (!(await exists(code))) return code;
  }
  throw new Error("could not allocate a unique proof code");
}
