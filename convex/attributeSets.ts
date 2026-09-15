// convex/attributeSets.ts
// Admin-defined attribute schemas: the questions a seller answers for a given
// category.
//
// The point of this table is that adding a vertical stops being a deploy. A
// category with a row here drives its own seller form and its own server-side
// validation; a category without one keeps running on the hardcoded
// VerticalConfig in packages/types/src/verticals.ts, which is what every
// apparel product in the catalogue was created under.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireRole } from "./lib/auth";

/**
 * `key` is the name the answer is stored under in products.details. It is part
 * of the data, not the presentation: once products carry a key, renaming it
 * strands every value already written under the old name. Admin can relabel
 * freely — `label` is what the seller reads — but the key is fixed at creation.
 */
const RESERVED_KEYS = new Set([
  // Top-level product columns. A detail key colliding with one of these reads
  // as a column in some consumers and a detail in others.
  "material",
  "care",
  "origin",
  "story",
  "name",
  "description",
  "price",
  "mrp",
  "sizes",
  "images",
]);

const AttributeFieldValidator = v.object({
  key:      v.string(),
  label:    v.string(),
  type:     v.union(
    v.literal("text"),
    v.literal("number"),
    v.literal("select"),
    v.literal("multi-select")
  ),
  options:  v.optional(v.array(v.string())),
  required: v.boolean(),
  unit:     v.optional(v.string()),
  helpText: v.optional(v.string()),
});

export type AttributeField = {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "multi-select";
  options?: string[];
  required: boolean;
  unit?: string;
  helpText?: string;
};

/**
 * Exported so migrations that seed schemas run exactly the checks the admin
 * screen does, rather than a copy that could drift.
 */
export function validateFields(fields: AttributeField[]) {
  const seen = new Set<string>();

  for (const field of fields) {
    const key = field.key.trim();
    if (!key) throw new Error("Every attribute needs a key.");
    if (!/^[a-z][a-zA-Z0-9]*$/.test(key)) {
      throw new Error(
        `Invalid attribute key "${key}". Use camelCase starting with a lowercase letter, e.g. "volumeMl".`
      );
    }
    if (RESERVED_KEYS.has(key)) {
      throw new Error(
        `"${key}" is a built-in product field and cannot be used as an attribute key.`
      );
    }
    if (seen.has(key)) {
      throw new Error(`Duplicate attribute key "${key}".`);
    }
    seen.add(key);

    if (!field.label.trim()) {
      throw new Error(`Attribute "${key}" needs a label — that is what the seller reads.`);
    }

    const isChoice = field.type === "select" || field.type === "multi-select";
    if (isChoice) {
      const options = (field.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (options.length === 0) {
        throw new Error(
          `Attribute "${field.label}" is a ${field.type} but has no options, so the seller would have nothing to choose from.`
        );
      }
      if (new Set(options).size !== options.length) {
        throw new Error(`Attribute "${field.label}" has duplicate options.`);
      }
    }
  }

  return fields.map((f) => ({
    key:      f.key.trim(),
    label:    f.label.trim(),
    type:     f.type,
    options:
      f.type === "select" || f.type === "multi-select"
        ? (f.options ?? []).map((o) => o.trim()).filter(Boolean)
        : undefined,
    required: f.required,
    unit:     f.unit?.trim() || undefined,
    helpText: f.helpText?.trim() || undefined,
  }));
}

/**
 * The attribute schema for one category, or null when the category still runs
 * on its vertical's hardcoded configuration.
 */
export const getForCategory = query({
  args: { categoryId: v.id("categories") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("attributeSets")
      .withIndex("by_categoryId", (q) => q.eq("categoryId", args.categoryId))
      .first();
  },
});

/**
 * Every attribute set, for screens that need to show at a glance which
 * categories are DB-driven — the admin category tree, and the seller form,
 * which resolves a schema without a second round trip per category.
 */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("attributeSets").collect();
  },
});

/**
 * Create or replace a category's attribute schema.
 *
 * Saving an empty field list deletes the row, which hands the category back to
 * its vertical's hardcoded configuration rather than leaving it with a schema
 * that asks nothing.
 */
export const saveForCategory = mutation({
  args: {
    categoryId: v.id("categories"),
    fields:     v.array(AttributeFieldValidator),
  },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin");

    const category = await ctx.db.get(args.categoryId);
    if (!category) throw new Error("Category not found.");

    const existing = await ctx.db
      .query("attributeSets")
      .withIndex("by_categoryId", (q) => q.eq("categoryId", args.categoryId))
      .first();

    if (args.fields.length === 0) {
      if (existing) await ctx.db.delete(existing._id);
      return null;
    }

    const fields = validateFields(args.fields as AttributeField[]);

    // Removing a key that products already store would leave those values
    // unreachable through the form and rejected by validation on the next edit.
    if (existing) {
      const removed = existing.fields
        .map((f) => f.key)
        .filter((k) => !fields.some((f) => f.key === k));

      if (removed.length > 0) {
        const products = await ctx.db
          .query("products")
          .withIndex("by_categoryId", (q) => q.eq("categoryId", args.categoryId))
          .collect();

        const inUse = removed.filter((key) =>
          products.some((p) => p.details && p.details[key])
        );

        if (inUse.length > 0) {
          throw new Error(
            `Cannot remove ${inUse.map((k) => `"${k}"`).join(", ")}: ${products.length} product(s) in this category already store ${inUse.length === 1 ? "that value" : "those values"}. Clear it from those products first.`
          );
        }
      }
    }

    const payload = {
      categoryId: args.categoryId,
      fields,
      updatedAt:  Date.now(),
      updatedBy:  admin._id,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("attributeSets", payload);
  },
});
