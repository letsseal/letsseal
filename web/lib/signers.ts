export type RecipientColor = {
  name: string;
  solid: string; 
  border: string; 
  fill: string; 
  fillActive: string; 
  text: string; 
};

export const RECIPIENT_COLORS: RecipientColor[] = [
  { name: "blue",    solid: "#2563eb", border: "#3b82f6", fill: "rgba(59,130,246,0.10)", fillActive: "rgba(59,130,246,0.20)", text: "#1d4ed8" },
  { name: "emerald", solid: "#059669", border: "#10b981", fill: "rgba(16,185,129,0.10)", fillActive: "rgba(16,185,129,0.20)", text: "#047857" },
  { name: "amber",   solid: "#d97706", border: "#f59e0b", fill: "rgba(245,158,11,0.12)", fillActive: "rgba(245,158,11,0.22)", text: "#b45309" },
  { name: "fuchsia", solid: "#c026d3", border: "#d946ef", fill: "rgba(217,70,239,0.10)", fillActive: "rgba(217,70,239,0.20)", text: "#a21caf" },
  { name: "cyan",    solid: "#0891b2", border: "#06b6d4", fill: "rgba(6,182,212,0.10)",  fillActive: "rgba(6,182,212,0.20)",  text: "#0e7490" },
  { name: "rose",    solid: "#e11d48", border: "#f43f5e", fill: "rgba(244,63,94,0.10)",  fillActive: "rgba(244,63,94,0.20)",  text: "#be123c" },
  { name: "lime",    solid: "#65a30d", border: "#84cc16", fill: "rgba(132,204,22,0.12)", fillActive: "rgba(132,204,22,0.22)", text: "#4d7c0f" },
  { name: "violet",  solid: "#7c3aed", border: "#8b5cf6", fill: "rgba(139,92,246,0.10)", fillActive: "rgba(139,92,246,0.20)", text: "#6d28d9" },
];

export function recipientColor(index: number): RecipientColor {
  return RECIPIENT_COLORS[((index % RECIPIENT_COLORS.length) + RECIPIENT_COLORS.length) % RECIPIENT_COLORS.length];
}

export const RECIPIENT_ROLES = [
  { id: "signer",    label: "Needs to Sign",     signs: true,  fields: true,  hint: "Signs the document" },
  { id: "in_person", label: "In-Person Signer",  signs: true,  fields: true,  hint: "Signs on your device" },
  { id: "cc",        label: "Receives a Copy",   signs: false, fields: false, hint: "Emailed the finished copy" },
  { id: "viewer",    label: "Needs to View",     signs: false, fields: false, hint: "Gets a copy to review" },
] as const;

export type RoleId = (typeof RECIPIENT_ROLES)[number]["id"];
export const roleMeta = (id: string) => RECIPIENT_ROLES.find((r) => r.id === id) ?? RECIPIENT_ROLES[0];
export const SIGNING_ROLES = ["signer", "in_person"];
export const isSigningRole = (role: string) => SIGNING_ROLES.includes(role);

export const FIELD_TYPES = [
  { type: "signature", label: "Signature", size: [0.22, 0.06] as [number, number] },
  { type: "initials",  label: "Initials",  size: [0.09, 0.05] as [number, number] },
  { type: "date",      label: "Date signed", size: [0.15, 0.035] as [number, number] },
  { type: "text",      label: "Text",      size: [0.2, 0.035] as [number, number] },
  { type: "checkbox",  label: "Checkbox",  size: [0.03, 0.025] as [number, number] },
] as const;

export type FieldType = (typeof FIELD_TYPES)[number]["type"];

export function blockingFields<T extends { id?: string | null; required?: boolean | null }>(
  fields: T[],
  values: Record<string, string | undefined>,
): T[] {
  return fields.filter((f) => f.required !== false && !String(values[f.id ?? ""] ?? "").trim());
}

export function reorderMap(count: number, from: number, to: number): Map<number, number> {
  const positions = Array.from({ length: count }, (_, i) => i);
  if (from >= 0 && from < count && to >= 0 && to < count) {
    positions.splice(to, 0, ...positions.splice(from, 1));
  }
  return new Map(positions.map((oldIndex, newIndex) => [oldIndex, newIndex]));
}

export function reorder<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return next;
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}
