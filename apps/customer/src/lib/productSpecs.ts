/**
 * The specification rows shown on a product page.
 *
 * A product in a category with an admin-defined attribute schema is described by
 * that schema: every answered field, in the order the admin arranged them, with
 * its unit. Everything else falls back to the vertical's built-in spec keys,
 * which for most verticals is just colour.
 *
 * Without the schema path, a notebook's pages, paper weight and binding were
 * saved against the product but never shown to the shopper.
 *
 * Free of React and Convex so the product page and its tests share one
 * implementation.
 */

/** The presentation half of an attribute schema field, as sent by getProduct. */
export interface SpecAttributeField {
  key: string;
  label: string;
  unit?: string;
}

export interface SpecRow {
  key: string;
  label: string;
  value: string;
}

export function resolveSpecRows(
  details: Record<string, string> | undefined,
  specKeys: readonly string[],
  specLabels: Partial<Record<string, string>>,
  attributeFields?: readonly SpecAttributeField[] | null
): SpecRow[] {
  const source = details ?? {};
  const rows: SpecRow[] = [];

  // A schema, when present, governs outright -- the same rule the server applies
  // when validating details. Keys outside it are never shown.
  if (attributeFields && attributeFields.length > 0) {
    for (const field of attributeFields) {
      const value = readValue(source[field.key]);
      if (!value) continue;
      rows.push({
        key: field.key,
        label: field.label,
        value: withUnit(formatList(value), field.unit),
      });
    }
    return rows;
  }

  for (const key of specKeys) {
    const value = readValue(source[key]);
    if (!value) continue;
    rows.push({ key, label: specLabels[key] || key, value });
  }
  return rows;
}

function readValue(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

/** Multi-select answers are stored comma-separated; show them as a readable list. */
function formatList(value: string): string {
  if (!value.includes(",")) return value;
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

/** Appends the unit, unless the seller already typed it. */
function withUnit(value: string, unit?: string): string {
  const suffix = unit?.trim();
  if (!suffix) return value;
  if (value.toLowerCase().endsWith(suffix.toLowerCase())) return value;
  return `${value} ${suffix}`;
}
