
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;
export const MIN_ACCEPTED_SCORE = 2; 

const COMMON = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890",
  "qwerty", "qwerty123", "letmein", "welcome", "welcome1", "admin", "iloveyou",
  "monkey", "dragon", "abc123", "111111", "000000", "password!", "changeme",
  "letsseal", "docsigner",
]);

export const STRENGTH_LABELS = ["Very weak", "Weak", "Fair", "Good", "Strong"] as const;
export const STRENGTH_COLORS = ["#dc2626", "#f97316", "#eab308", "#84cc16", "#16a34a"] as const;

export type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string };

export function scorePassword(pw: string): Strength {
  if (!pw) return { score: 0, label: STRENGTH_LABELS[0] };
  const len = pw.length;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;

  let score = 0;
  if (len >= 8) score++;
  if (len >= 12) score++;
  if (len >= 16) score++;
  if (classes >= 3) score++;
  if (classes >= 2 && len >= 12) score++;
  score = Math.min(score, 4);

  const lower = pw.toLowerCase();
  if (COMMON.has(lower)) score = 0;
  if (/^(.)\1+$/.test(pw)) score = 0; 
  if (/^(?:0?123|abc|qwe|asd|zxc|password|letmein)/i.test(pw)) score = Math.min(score, 1);
  if (len < 8) score = Math.min(score, 1);

  return { score: score as Strength["score"], label: STRENGTH_LABELS[score] };
}

export function passwordProblem(pw: string): string | null {
  if (!pw || pw.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (pw.length > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  if (COMMON.has(pw.toLowerCase())) return "That password is too common — pick something less guessable.";
  if (scorePassword(pw).score < MIN_ACCEPTED_SCORE)
    return "Too weak — mix in more length, or upper/lower case, numbers and symbols.";
  return null;
}
