const MAX_NAME = 80;

const RESERVED = [
  "paypal", "microsoft", "apple", "amazon", "google", "coinbase", "stripe",
  "meta", "facebook", "instagram", "whatsapp", "netflix", "docusign",
  "no-reply", "noreply", "no reply", "admin", "administrator",
];

export function orgNameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 2) return "Name is too short";
  if (trimmed.length > MAX_NAME) return `Name is too long (max ${MAX_NAME} characters)`;
  const norm = trimmed.toLowerCase().replace(/\s+/g, " ");
  for (const brand of RESERVED) {
    if (norm === brand || norm.includes(brand)) {
      return "That name isn't available. If it's genuinely your business, contact us to verify it.";
    }
  }
  return null;
}
