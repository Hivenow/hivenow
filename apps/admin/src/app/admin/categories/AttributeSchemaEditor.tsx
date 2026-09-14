"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Button, Input, Select } from "@hive/ui";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

/**
 * The questions a seller answers when listing into one category.
 *
 * A category with no schema here keeps running on its vertical's hardcoded
 * configuration — that is the apparel path, and it is deliberately left alone.
 * Adding the first field is what moves a category onto the database path.
 */

export type AttributeFieldType = "text" | "number" | "select" | "multi-select";

export interface AttributeFieldDraft {
  key: string;
  label: string;
  type: AttributeFieldType;
  options: string[];
  required: boolean;
  unit: string;
  helpText: string;
}

const FIELD_TYPE_OPTIONS: Array<{ value: AttributeFieldType; label: string }> = [
  { value: "text", label: "Text — free typing" },
  { value: "number", label: "Number — digits only" },
  { value: "select", label: "Choice — pick one" },
  { value: "multi-select", label: "Choice — pick several" },
];

/**
 * Starting points, not constraints. Each one is an ordinary set of fields that
 * an admin can edit or throw away; nothing in the code recognises them after
 * they are inserted.
 */
const PRESETS: Record<string, { label: string; fields: AttributeFieldDraft[] }> = {
  fragrance: {
    label: "Perfume",
    fields: [
      { key: "volumeMl", label: "Volume", type: "number", options: [], required: true, unit: "ml", helpText: "Bottle size in millilitres" },
      { key: "concentration", label: "Concentration", type: "select", options: ["Parfum", "Eau de Parfum", "Eau de Toilette", "Eau de Cologne"], required: true, unit: "", helpText: "" },
      { key: "fragranceFamily", label: "Olfactory Family", type: "select", options: ["Floral", "Woody", "Oriental", "Fresh", "Citrus", "Gourmand"], required: false, unit: "", helpText: "" },
      { key: "topNotes", label: "Top Notes", type: "text", options: [], required: false, unit: "", helpText: "" },
      { key: "baseNotes", label: "Base Notes", type: "text", options: [], required: false, unit: "", helpText: "" },
    ],
  },
  handbag: {
    label: "Bag",
    fields: [
      { key: "bagType", label: "Bag Type", type: "select", options: ["Tote", "Sling", "Backpack", "Clutch", "Shoulder Bag", "Satchel"], required: true, unit: "", helpText: "" },
      { key: "bagSize", label: "Size", type: "select", options: ["Small", "Medium", "Large"], required: true, unit: "", helpText: "" },
      { key: "capacityL", label: "Capacity", type: "number", options: [], required: false, unit: "L", helpText: "Volume in litres" },
      { key: "pockets", label: "Pockets", type: "number", options: [], required: false, unit: "", helpText: "How many compartments in total" },
      { key: "strapType", label: "Strap / Handle", type: "select", options: ["Adjustable", "Fixed", "Detachable", "Chain", "None"], required: false, unit: "", helpText: "" },
    ],
  },
  bedsheet: {
    label: "Bedsheet / Linen",
    fields: [
      { key: "fabric", label: "Fabric / Material", type: "select", options: ["100% Cotton", "Pure Cotton", "Linen", "Satin", "Egyptian Cotton", "Microfiber", "Cotton Blend", "Silk"], required: true, unit: "", helpText: "Fabric composition" },
      { key: "threadCount", label: "Thread Count", type: "number", options: [], required: false, unit: "TC", helpText: "e.g. 180, 210, 300, 400" },
      { key: "sheetType", label: "Sheet Type", type: "select", options: ["Flat", "Fitted (Elastic)", "Fitted with Flat Set"], required: true, unit: "", helpText: "Flat or fitted elastic sheet" },
      { key: "pillowCovers", label: "Pillow Covers Included", type: "select", options: ["None", "1 Pillow Cover", "2 Pillow Covers", "4 Pillow Covers"], required: true, unit: "", helpText: "Number of pillow covers included in pack" },
      { key: "dimensions", label: "Dimensions", type: "text", options: [], required: false, unit: "", helpText: "e.g. 90 x 100 inches / 228 x 254 cm" },
      { key: "pattern", label: "Pattern / Print", type: "select", options: ["Solid / Plain", "Floral", "Geometric", "Striped", "Abstract", "Traditional / Ethnic", "Polka Dots", "Embroidered"], required: false, unit: "", helpText: "" },
      { key: "careInstructions", label: "Care Instructions", type: "text", options: [], required: false, unit: "", helpText: "e.g. Machine wash cold, gentle cycle, tumble dry low" },
    ],
  },
};

function toCamelKey(label: string): string {
  const words = label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const [first, ...rest] = words;
  if (!first) return "";
  return first + rest.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}

const blankField = (): AttributeFieldDraft => ({
  key: "",
  label: "",
  type: "text",
  options: [],
  required: false,
  unit: "",
  helpText: "",
});

interface Props {
  categoryId: string;
  categoryName: string;
  /** Shown when no schema exists, so the fallback behaviour is not a mystery. */
  verticalLabel: string;
}

export function AttributeSchemaEditor({ categoryId, categoryName, verticalLabel }: Props) {
  const stored = useQuery(api.attributeSets.getForCategory, {
    categoryId: categoryId as any,
  });
  const saveSchema = useMutation(api.attributeSets.saveForCategory);

  const [fields, setFields] = useState<AttributeFieldDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Reload whenever the selected category or its stored schema changes.
  useEffect(() => {
    if (stored === undefined) return;
    setFields(
      (stored?.fields ?? []).map((f: any) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        options: f.options ?? [],
        required: f.required,
        unit: f.unit ?? "",
        helpText: f.helpText ?? "",
      }))
    );
    setError(null);
  }, [stored, categoryId]);

  // A key is the name the answer is stored under on the product. Once products
  // carry it, renaming it strands their values, so existing keys are read-only.
  const lockedKeys = useMemo(
    () => new Set((stored?.fields ?? []).map((f: any) => f.key)),
    [stored]
  );

  const patch = (index: number, changes: Partial<AttributeFieldDraft>) =>
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...changes } : f)));

  const move = (index: number, direction: -1 | 1) =>
    setFields((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const moved = next[target]!;
      next[target] = next[index]!;
      next[index] = moved;
      return next;
    });

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveSchema({
        categoryId: categoryId as any,
        fields: fields.map((f) => ({
          key: f.key.trim(),
          label: f.label.trim(),
          type: f.type,
          options:
            f.type === "select" || f.type === "multi-select" ? f.options : undefined,
          required: f.required,
          unit: f.unit.trim() || undefined,
          helpText: f.helpText.trim() || undefined,
        })),
      });
      setSavedAt(Date.now());
    } catch (err: any) {
      setError(err?.message?.replace(/^\[.*?\]\s*/, "") ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  if (stored === undefined) {
    return (
      <div className="flex items-center gap-2 py-10 justify-center text-hive-text-muted text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading attribute schema…
      </div>
    );
  }

  const isDbDriven = fields.length > 0;

  return (
    <div className="flex flex-col gap-5">
      {/* What this screen is actually deciding */}
      <div
        className={`rounded-2xl border p-4 flex flex-col gap-1 ${
          isDbDriven
            ? "border-hive-gold/40 bg-hive-comb/20"
            : "border-hive-border/60 bg-hive-cream/10"
        }`}
      >
        <span className="text-sm font-bold text-hive-dark">
          {isDbDriven
            ? `Sellers listing under ${categoryName} answer these ${fields.length} question${fields.length === 1 ? "" : "s"}.`
            : `${categoryName} uses the built-in ${verticalLabel} form.`}
        </span>
        <span className="text-xs text-hive-text-muted leading-relaxed">
          {isDbDriven
            ? "This list replaces the built-in form for this category. Reorder it to change the order the seller sees."
            : "Add a field below to take over the form for this category. Leave it empty to keep the built-in one — that is the right choice for clothing."}
        </span>
      </div>

      {/* Presets — offer on empty schema or as replacement action */}
      {fields.length === 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-hive-text-muted mr-1">
            Start from
          </span>
          {Object.entries(PRESETS).map(([id, preset]) => (
            <Button
              key={id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFields(preset.fields.map((f) => ({ ...f, options: [...f.options] })))}
            >
              <Sparkles className="w-3.5 h-3.5" /> {preset.label}
            </Button>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-hive-cream/20 rounded-xl border border-hive-border/40">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-hive-text-muted mr-1">
              Replace with preset:
            </span>
            {Object.entries(PRESETS).map(([id, preset]) => (
              <Button
                key={id}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (
                    window.confirm(
                      `Replace current questions with "${preset.label}" preset? Unsaved changes will be replaced.`
                    )
                  ) {
                    setFields(
                      preset.fields.map((f) => ({ ...f, options: [...f.options] }))
                    );
                  }
                }}
              >
                <Sparkles className="w-3.5 h-3.5" /> {preset.label}
              </Button>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 cursor-pointer"
            onClick={() => {
              if (
                window.confirm(
                  "Clear all questions for this category? If saved empty, this category will revert to built-in vertical defaults."
                )
              ) {
                setFields([]);
              }
            }}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear All
          </Button>
        </div>
      )}

      {/* Field list */}
      <div className="flex flex-col gap-3">
        {fields.map((field, index) => {
          const isChoice = field.type === "select" || field.type === "multi-select";
          const keyLocked = lockedKeys.has(field.key);

          return (
            <div
              key={index}
              className="rounded-2xl border border-hive-border/70 bg-white p-4 flex flex-col gap-3.5"
            >
              <div className="flex items-start gap-3">
                <span className="mt-2.5 w-6 h-6 rounded-lg bg-hive-comb/60 text-hive-dark text-[10px] font-extrabold flex items-center justify-center shrink-0">
                  {index + 1}
                </span>

                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Question the seller sees"
                    placeholder="e.g. Volume"
                    value={field.label}
                    onChange={(e) => {
                      const label = e.target.value;
                      // Derive the key from the label until the field is saved;
                      // after that the key is fixed and the label is free.
                      patch(index, keyLocked ? { label } : { label, key: toCamelKey(label) });
                    }}
                  />
                  <Select
                    label="Answer type"
                    value={field.type}
                    onChange={(e) =>
                      patch(index, { type: e.target.value as AttributeFieldType })
                    }
                    options={FIELD_TYPE_OPTIONS}
                  />
                </div>

                <div className="flex flex-col gap-1 mt-6 shrink-0">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    title="Move up"
                    className="w-7 h-7 rounded-lg border border-hive-border/60 flex items-center justify-center text-hive-text-muted hover:bg-hive-cream disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === fields.length - 1}
                    title="Move down"
                    className="w-7 h-7 rounded-lg border border-hive-border/60 flex items-center justify-center text-hive-text-muted hover:bg-hive-cream disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setFields((prev) => prev.filter((_, i) => i !== index))}
                    title="Remove field"
                    className="w-7 h-7 rounded-lg border border-red-100 flex items-center justify-center text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {isChoice && (
                <div className="flex flex-col gap-2 pl-9">
                  <span className="text-xs font-semibold uppercase tracking-wider text-hive-text-muted">
                    Options
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {field.options.map((option, optionIndex) => (
                      <span
                        key={optionIndex}
                        className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-lg bg-hive-comb/50 border border-hive-border/50 text-xs font-semibold text-hive-dark"
                      >
                        {option}
                        <button
                          type="button"
                          onClick={() =>
                            patch(index, {
                              options: field.options.filter((_, i) => i !== optionIndex),
                            })
                          }
                          className="w-4 h-4 rounded-full hover:bg-red-100 text-hive-text-muted hover:text-red-600 flex items-center justify-center"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    <input
                      type="text"
                      placeholder="Type an option, press Enter"
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        const value = e.currentTarget.value.trim();
                        if (!value || field.options.includes(value)) return;
                        patch(index, { options: [...field.options, value] });
                        e.currentTarget.value = "";
                      }}
                      className="h-8 px-3 rounded-lg border border-dashed border-hive-border text-xs outline-none focus:border-hive-gold min-w-[190px]"
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-end gap-4 pl-9">
                {field.type === "number" && (
                  <div className="w-28">
                    <Input
                      label="Unit"
                      placeholder="ml, L, cm"
                      value={field.unit}
                      onChange={(e) => patch(index, { unit: e.target.value })}
                    />
                  </div>
                )}
                <div className="flex-1 min-w-[200px]">
                  <Input
                    label="Hint (optional)"
                    placeholder="Shown under the question"
                    value={field.helpText}
                    onChange={(e) => patch(index, { helpText: e.target.value })}
                  />
                </div>
                <label className="flex items-center gap-2 h-11 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(e) => patch(index, { required: e.target.checked })}
                    className="rounded border-hive-border text-hive-gold focus:ring-hive-gold w-4 h-4"
                  />
                  <span className="text-sm font-bold text-hive-dark">Required</span>
                </label>
              </div>

              <span className="pl-9 text-[11px] text-hive-text-muted font-mono">
                stored as {field.key || "—"}
                {keyLocked && " · fixed, products already use this name"}
              </span>
            </div>
          );
        })}

        <Button
          type="button"
          variant="outline"
          onClick={() => setFields((prev) => [...prev, blankField()])}
          className="self-start"
        >
          <Plus className="w-4 h-4" /> Add a question
        </Button>
      </div>

      {error && (
        <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-2 border-t border-hive-border/60">
        <Button type="button" onClick={handleSave} isLoading={saving} disabled={saving}>
          Save attribute schema
        </Button>
        {savedAt && !saving && !error && (
          <span className="text-xs text-green-700 font-bold">Saved.</span>
        )}
      </div>
    </div>
  );
}
