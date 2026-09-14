"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Card, CardContent, Button, Input, Select, Tabs } from "@hive/ui";
import {
  ArrowLeft,
  ChevronRight,
  CornerDownRight,
  Layers,
  ListCollapse,
  Loader2,
  Plus,
  Power,
  SlidersHorizontal,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { VERTICAL_CONFIGS, VERTICAL_TYPES, VerticalType, SizeSystemType } from "@hive/types";
import Link from "next/link";
import { AttributeSchemaEditor } from "./AttributeSchemaEditor";

/**
 * Category hierarchy manager.
 *
 * One screen, master-detail: the tree on the left, everything about the
 * selected category on the right. Its attribute schema lives in a tab here
 * rather than a separate menu item, because "which questions does this category
 * ask" is a property of the category and is meaningless without knowing which
 * one is selected.
 *
 * The tree is two levels by design — top-level categories and their children.
 * convex/categories.ts enforces that; this screen only has to render it.
 */

type CategoryRow = {
  _id: string;
  name: string;
  slug: string;
  parentId?: string;
  active: boolean;
  sortOrder: number;
  showOnHomepage?: boolean;
  isFreeSize?: boolean;
  seoIntro?: string;
  seoDescription?: string;
  verticalType?: VerticalType;
  sizeSystem?: SizeSystemType;
  imageUrl?: string | null;
  imageStorageId?: unknown;
};

const NEW_CATEGORY = "__new__";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

export default function AdminCategoriesPage() {
  const categories = useQuery(api.categories.getCategories, {}) as
    | CategoryRow[]
    | undefined;
  const attributeSets = useQuery(api.attributeSets.listAll, {});
  const createCategory = useMutation(api.categories.createCategory);
  const updateCategory = useMutation(api.categories.updateCategory);
  const deleteCategory = useMutation(api.categories.deleteCategory);
  const toggleCategory = useMutation(api.categories.toggleCategory);
  const generateUploadUrl = useAction(api.media.api.generateUploadUrl);
  const commitUpload = useAction(api.media.api.commitUpload);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"details" | "attributes">("details");

  // Draft state for the detail form
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [parentId, setParentId] = useState<string>("");
  const [sortOrder, setSortOrder] = useState(1);
  const [active, setActive] = useState(true);
  const [showOnHomepage, setShowOnHomepage] = useState(false);
  const [isFreeSize, setIsFreeSize] = useState(false);
  const [seoIntro, setSeoIntro] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [verticalType, setVerticalType] = useState<VerticalType>("apparel");
  const [sizeSystem, setSizeSystem] = useState<SizeSystemType | "">("");
  const [imageStorageId, setImageStorageId] = useState<unknown>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCreating = selectedId === NEW_CATEGORY;
  const selected = useMemo(
    () => categories?.find((c) => c._id === selectedId) ?? null,
    [categories, selectedId]
  );

  /**
   * Categories eligible to be a parent: active top-level ones, excluding the
   * row itself.
   *
   * A deactivated category is retired, so it must not be offered as a home for
   * new subcategories. It stays in the list while it is this row's current
   * parent: dropping it would leave the select with a value it does not
   * contain, which renders as "None" and silently detaches the category on the
   * next save.
   */
  const parentOptions = useMemo(() => {
    if (!categories) return [];
    return categories
      .filter(
        (c) =>
          !c.parentId &&
          c._id !== selectedId &&
          (c.active || c._id === parentId)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [categories, selectedId, parentId]);

  /** The tree, in the order it is rendered: each parent followed by its children. */
  const tree = useMemo(() => {
    if (!categories) return [];
    const byOrder = (a: CategoryRow, b: CategoryRow) =>
      (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name);
    const roots = categories.filter((c) => !c.parentId).sort(byOrder);
    return roots.map((root) => ({
      parent: root,
      children: categories.filter((c) => c.parentId === root._id).sort(byOrder),
    }));
  }, [categories]);

  const schemaFieldCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const set of attributeSets ?? []) {
      map.set(set.categoryId as string, set.fields.length);
    }
    return map;
  }, [attributeSets]);

  const loadDraft = (category: CategoryRow | null) => {
    setError(null);
    setSelectedFile(null);
    setSlugTouched(true);
    if (!category) {
      setName("");
      setSlug("");
      setSlugTouched(false);
      setParentId("");
      setSortOrder((categories?.length ?? 0) + 1);
      setActive(true);
      setShowOnHomepage(false);
      setIsFreeSize(false);
      setSeoIntro("");
      setSeoDescription("");
      setVerticalType("apparel");
      setSizeSystem("");
      setImageStorageId(null);
      setPreviewUrl(null);
      return;
    }
    setName(category.name);
    setSlug(category.slug);
    setParentId(category.parentId ?? "");
    setSortOrder(category.sortOrder);
    setActive(category.active);
    setShowOnHomepage(category.showOnHomepage ?? false);
    setIsFreeSize(category.isFreeSize ?? false);
    setSeoIntro(category.seoIntro ?? "");
    setSeoDescription(category.seoDescription ?? "");
    setVerticalType(category.verticalType ?? "apparel");
    setSizeSystem(category.sizeSystem ?? "");
    setImageStorageId(category.imageStorageId ?? null);
    setPreviewUrl(category.imageUrl ?? null);
  };

  // Reload the draft whenever the selection changes.
  useEffect(() => {
    if (selectedId === null) return;
    if (selectedId === NEW_CATEGORY) {
      loadDraft(null);
      setTab("details");
      return;
    }
    const category = categories?.find((c) => c._id === selectedId);
    if (category) loadDraft(category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, categories]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Invalid file type. Use JPG, PNG or WEBP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("File is too large. Maximum size is 5MB.");
      return;
    }
    setError(null);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isCreating && !selectedFile) {
      setError("A category image is required.");
      return;
    }

    setSubmitting(true);
    try {
      let finalStorageId = imageStorageId;

      if (selectedFile) {
        setUploading(true);
        const { presignedUrl, sessionId } = await generateUploadUrl({
          mimeType: selectedFile.type,
          fileSize: selectedFile.size,
          ownerType: "admin",
          ownerId: "categories",
          context: "category_image",
        });
        await fetch(presignedUrl, {
          method: "PUT",
          headers: { "Content-Type": selectedFile.type },
          body: selectedFile,
        });
        finalStorageId = await commitUpload({ sessionId });
        setUploading(false);
      }

      if (!finalStorageId) throw new Error("Failed to secure an image storage ID.");

      const payload = {
        name: name.trim(),
        slug: slug.trim(),
        imageStorageId: finalStorageId as any,
        active,
        sortOrder,
        showOnHomepage,
        isFreeSize,
        seoIntro: seoIntro.trim() || undefined,
        seoDescription: seoDescription.trim() || undefined,
        verticalType,
        sizeSystem: (sizeSystem as SizeSystemType) || undefined,
        parentId: parentId ? (parentId as any) : undefined,
      };

      if (isCreating) {
        const newId = await createCategory(payload);
        setSelectedId(newId as unknown as string);
      } else {
        await updateCategory({ id: selectedId as any, ...payload });
      }
      setSelectedFile(null);
    } catch (err: any) {
      setError(err?.message?.replace(/^\[.*?\]\s*/, "") ?? "Failed to save category.");
      setUploading(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (
      !confirm(
        `Delete "${selected.name}"? Its image is permanently removed from storage.`
      )
    )
      return;
    try {
      await deleteCategory({ id: selected._id as any });
      setSelectedId(null);
    } catch (err: any) {
      setError(err?.message?.replace(/^\[.*?\]\s*/, "") ?? "Failed to delete category.");
    }
  };

  if (categories === undefined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-hive-amber" />
        <p className="text-sm text-hive-text-muted font-medium">Loading categories...</p>
      </div>
    );
  }

  const renderRow = (category: CategoryRow, isChild: boolean) => {
    const isSelected = selectedId === category._id;
    const childCount = categories.filter((c) => c.parentId === category._id).length;
    const fieldCount = schemaFieldCount.get(category._id);

    return (
      <button
        key={category._id}
        type="button"
        onClick={() => setSelectedId(category._id)}
        className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
          isSelected
            ? "border-hive-gold bg-hive-comb/40 shadow-sm"
            : "border-transparent hover:bg-hive-cream/50"
        } ${isChild ? "ml-6 w-[calc(100%-1.5rem)]" : ""}`}
      >
        {isChild && (
          <CornerDownRight className="w-3.5 h-3.5 text-hive-text-muted/60 shrink-0" />
        )}
        <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-slate-50 border border-hive-border/50 shrink-0">
          {category.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={category.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[8px] font-bold text-red-400 bg-red-50">
              No img
            </div>
          )}
        </div>

        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`truncate text-sm ${
                isChild ? "font-semibold text-hive-text" : "font-bold text-hive-dark"
              } ${!category.active ? "opacity-50" : ""}`}
            >
              {category.name}
            </span>
            {!category.active && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500 shrink-0">
                Off
              </span>
            )}
            {typeof fieldCount === "number" && (
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-hive-gold/20 text-hive-dark shrink-0"
                title={`${fieldCount} custom attribute${fieldCount === 1 ? "" : "s"}`}
              >
                {fieldCount} attr
              </span>
            )}
          </div>
          <span className="text-[11px] text-hive-text-muted font-mono truncate">
            /{category.slug}
            {childCount > 0 && ` · ${childCount} sub`}
          </span>
        </div>

        <ChevronRight
          className={`w-4 h-4 shrink-0 ${
            isSelected ? "text-hive-gold" : "text-hive-text-muted/40"
          }`}
        />
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-6 text-left">
      <div className="flex items-center gap-4">
        <Link
          href="/admin"
          className="p-2 rounded-xl hover:bg-slate-200/50 transition-colors border border-transparent"
        >
          <ArrowLeft className="w-5 h-5 text-slate-700" />
        </Link>
        <div>
          <h1 className="text-3xl font-serif font-black text-hive-dark">Category Hierarchy</h1>
          <p className="text-sm text-hive-text-muted">
            Parent categories, their subcategories, and the questions each one asks a seller.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ── Tree ─────────────────────────────────────────────────────────── */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-hive-text-muted">
              {tree.length} top-level · {categories.length} total
            </h2>
            <Button size="sm" onClick={() => setSelectedId(NEW_CATEGORY)}>
              <Plus className="w-4 h-4" /> New
            </Button>
          </div>

          <Card>
            <CardContent className="p-2 flex flex-col gap-0.5 max-h-[calc(100vh-16rem)] overflow-y-auto">
              {tree.length === 0 ? (
                <div className="p-10 text-center flex flex-col items-center gap-3">
                  <ListCollapse className="w-6 h-6 text-hive-text-muted" />
                  <span className="text-sm font-bold text-hive-dark">No categories yet</span>
                </div>
              ) : (
                tree.map(({ parent, children }) => (
                  <React.Fragment key={parent._id}>
                    {renderRow(parent, false)}
                    {children.map((child) => renderRow(child, true))}
                  </React.Fragment>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Detail ───────────────────────────────────────────────────────── */}
        <div className="lg:col-span-7">
          {selectedId === null ? (
            <Card>
              <CardContent className="p-14 flex flex-col items-center justify-center gap-3 text-center">
                <div className="w-14 h-14 rounded-full bg-hive-cream/40 flex items-center justify-center border border-hive-border/40 text-hive-text-muted">
                  <Layers className="w-6 h-6" />
                </div>
                <span className="text-base font-bold font-serif text-hive-dark">
                  Pick a category
                </span>
                <span className="text-xs text-hive-text-muted max-w-xs leading-relaxed">
                  Its details, its place in the hierarchy and its seller questions all appear
                  here.
                </span>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="px-6 pt-5 pb-0 flex flex-col gap-1">
                  <h2 className="text-xl font-serif font-bold text-hive-dark">
                    {isCreating ? "New category" : selected?.name}
                  </h2>
                  {!isCreating && selected?.parentId && (
                    <span className="text-xs text-hive-text-muted">
                      Subcategory of{" "}
                      <span className="font-bold">
                        {categories.find((c) => c._id === selected.parentId)?.name}
                      </span>
                    </span>
                  )}
                </div>

                <div className="px-6 pt-3">
                  <Tabs
                    variant="pills"
                    activeId={tab}
                    onChange={(id) => setTab(id as "details" | "attributes")}
                    items={[
                      { id: "details", label: "Details", icon: <Layers className="w-4 h-4" /> },
                      {
                        id: "attributes",
                        label: "Attributes",
                        icon: <SlidersHorizontal className="w-4 h-4" />,
                        count: schemaFieldCount.get(selectedId),
                      },
                    ]}
                  />
                </div>

                <div className="p-6">
                  {tab === "details" ? (
                    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                      <Input
                        label="Category name"
                        required
                        placeholder="e.g. Perfumes"
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          if (!slugTouched) setSlug(slugify(e.target.value));
                        }}
                      />

                      <Input
                        label="URL slug"
                        required
                        placeholder="e.g. perfumes"
                        value={slug}
                        onChange={(e) => {
                          setSlugTouched(true);
                          setSlug(slugify(e.target.value));
                        }}
                      />
                      <p className="-mt-3 text-[11px] text-hive-text-muted">
                        The category opens at <span className="font-mono">/products?category={slug || "…"}</span>.
                        Changing it breaks links already pointing at the old address.
                      </p>

                      <Select
                        label="Parent category"
                        value={parentId}
                        onChange={(e) => setParentId(e.target.value)}
                      >
                        <option value="">None — this is a top-level category</option>
                        {parentOptions.map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.name}
                            {c.active ? "" : " (inactive)"}
                          </option>
                        ))}
                      </Select>
                      <p className="-mt-3 text-[11px] text-hive-text-muted">
                        Browsing a parent shows its own products and every subcategory&apos;s.
                        Nesting is one level deep.
                      </p>

                      <Select
                        label="Vertical"
                        value={verticalType}
                        onChange={(e) => setVerticalType(e.target.value as VerticalType)}
                        options={VERTICAL_TYPES.map((vt) => ({
                          value: vt,
                          label: VERTICAL_CONFIGS[vt].label,
                        }))}
                      />
                      <p className="-mt-3 text-[11px] text-hive-text-muted">
                        Sets returns and exchange defaults, and the built-in seller form used
                        when this category has no attributes of its own. Existing products keep
                        the vertical they were created under.
                      </p>

                      <Select
                        label="Size System"
                        value={sizeSystem}
                        onChange={(e) => setSizeSystem(e.target.value as SizeSystemType | "")}
                      >
                        <option value="">Auto (derived from category / vertical)</option>
                        <option value="bed_linen">Bed Linen (Single, Double, Queen, King, Super King)</option>
                        <option value="alpha">Apparel Alpha (XS, S, M, L, XL, XXL, 3XL, 4XL)</option>
                        <option value="waist_numeric">Waist Numeric — Men (28 to 42)</option>
                        <option value="waist_numeric_women">Waist Numeric — Women (26 to 40)</option>
                        <option value="footwear_uk_men">Footwear — UK Men (UK 6 to 12)</option>
                        <option value="footwear_uk_women">Footwear — UK Women (UK 3 to 9)</option>
                        <option value="belt_numeric">Belts (28 to 42, Free Size)</option>
                        <option value="kids_age">Kids Age (0-6M to 9-10Y)</option>
                        <option value="free_size">Free Size (One Size Only)</option>
                        <option value="custom">Custom</option>
                      </Select>
                      <p className="-mt-3 text-[11px] text-hive-text-muted">
                        Determines the size options shown to sellers when listing into this category.
                        Choose Bed Linen for bedsheets, Alpha for apparel, or leave Auto.
                      </p>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-hive-text-muted">
                          Category image
                        </label>
                        <div
                          className={`relative flex flex-col items-center justify-center w-full h-40 border-2 border-dashed ${
                            previewUrl ? "border-hive-gold/50" : "border-hive-border/60"
                          } rounded-xl bg-hive-cream/5 hover:bg-hive-cream/20 transition-colors cursor-pointer overflow-hidden`}
                        >
                          <input
                            type="file"
                            accept="image/jpeg, image/png, image/webp"
                            onChange={handleFileChange}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          />
                          {previewUrl ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={previewUrl}
                                alt="Preview"
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold pointer-events-none">
                                Click to replace image
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-col items-center justify-center gap-2 text-hive-text-muted">
                              <UploadCloud className="w-8 h-8 text-hive-border" />
                              <div className="text-sm font-semibold">Click or drag to upload</div>
                              <div className="text-[10px] uppercase tracking-wide">
                                JPG, PNG, WEBP · max 5MB
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 items-start">
                        <Input
                          label="Sort order"
                          type="number"
                          min={1}
                          required
                          value={sortOrder}
                          onChange={(e) => setSortOrder(parseInt(e.target.value) || 1)}
                        />
                        <div className="flex flex-col gap-2.5 pt-7">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={active}
                              onChange={(e) => setActive(e.target.checked)}
                              className="rounded border-hive-border text-hive-gold focus:ring-hive-gold w-4 h-4"
                            />
                            <span className="text-sm font-bold text-hive-dark">Active</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={showOnHomepage}
                              onChange={(e) => setShowOnHomepage(e.target.checked)}
                              className="rounded border-hive-border text-hive-gold focus:ring-hive-gold w-4 h-4"
                            />
                            <span className="text-sm font-bold text-hive-dark">
                              Show on homepage
                            </span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={isFreeSize}
                              onChange={(e) => setIsFreeSize(e.target.checked)}
                              className="rounded border-hive-border text-hive-gold focus:ring-hive-gold w-4 h-4"
                            />
                            <span className="text-sm font-bold text-hive-dark">One size only</span>
                          </label>
                        </div>
                      </div>
                      <p className="-mt-3 text-[11px] text-hive-text-muted">
                        &ldquo;One size only&rdquo; skips the size matrix in the seller form —
                        sarees, dupattas, stoles.
                      </p>

                      <div className="flex flex-col gap-3 pt-1">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-semibold uppercase tracking-wider text-hive-text-muted">
                            Landing page copy
                          </span>
                          <span className="text-[11px] text-hive-text-muted">
                            Optional. Left blank, the page falls back to copy generated from the
                            category name — never an empty block.
                          </span>
                        </div>
                        <textarea
                          value={seoIntro}
                          onChange={(e) => setSeoIntro(e.target.value)}
                          rows={3}
                          placeholder="Opening paragraph shown under the product grid"
                          className="w-full px-4 py-3 rounded-xl border border-hive-border text-hive-text bg-white text-sm outline-none focus:border-hive-gold focus:ring-1 focus:ring-hive-gold resize-y"
                        />
                        <textarea
                          value={seoDescription}
                          onChange={(e) => setSeoDescription(e.target.value)}
                          rows={2}
                          placeholder="Search result description (roughly 150 characters)"
                          className="w-full px-4 py-3 rounded-xl border border-hive-border text-hive-text bg-white text-sm outline-none focus:border-hive-gold focus:ring-1 focus:ring-hive-gold resize-y"
                        />
                      </div>

                      {error && (
                        <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                          {error}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-3 pt-4 border-t border-hive-border/60">
                        <Button type="submit" isLoading={submitting} disabled={submitting}>
                          {uploading
                            ? "Uploading image…"
                            : isCreating
                              ? "Create category"
                              : "Save changes"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setSelectedId(null)}
                          disabled={submitting}
                        >
                          Close
                        </Button>
                        {!isCreating && selected && (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() =>
                                toggleCategory({
                                  id: selected._id as any,
                                  active: !selected.active,
                                })
                              }
                              className="ml-auto"
                            >
                              <Power className="w-4 h-4" />
                              {selected.active ? "Disable" : "Enable"}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={handleDelete}
                              className="text-red-500 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" /> Delete
                            </Button>
                          </>
                        )}
                      </div>
                    </form>
                  ) : isCreating ? (
                    <p className="text-sm text-hive-text-muted py-10 text-center">
                      Create the category first, then set the questions it asks.
                    </p>
                  ) : (
                    selected && (
                      <AttributeSchemaEditor
                        key={selected._id}
                        categoryId={selected._id}
                        categoryName={selected.name}
                        verticalLabel={
                          VERTICAL_CONFIGS[selected.verticalType ?? "apparel"].label
                        }
                      />
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
