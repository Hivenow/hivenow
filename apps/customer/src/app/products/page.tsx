import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { ProductsClient } from "./ProductsClient";
import { getProductsMetadata } from "@/lib/seo";
import { BreadcrumbSchema } from "@/components/seo/BreadcrumbSchema";
import { SITE_URL } from "@/lib/seo";

import { permanentRedirect } from "next/navigation";

export const metadata = getProductsMetadata();

interface PageProps {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

interface CategoryListItem {
  name: string;
  slug: string;
}

/**
 * Categories for the ItemList structured data, read from the catalogue rather than listed here.
 *
 * This was a hardcoded array of eight, written against categories that were planned rather than
 * created: half of them - dresses, footwear, jeans, shirts - had no matching category in
 * production, so the schema handed search engines four URLs that answer 404. Nothing rendered
 * them as links, which is why it went unnoticed; only crawlers ever followed them.
 *
 * Reading the categories means the list cannot drift from what exists again. Every slug returned
 * here resolves, since it is the same table /products/[slug] resolves against.
 */
async function fetchCategoryList(): Promise<CategoryListItem[]> {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return [];

  try {
    const categories = await new ConvexHttpClient(url).query(
      api.categories.getCategories,
      { onlyActive: true }
    );
    return (categories ?? [])
      .filter((c: any) => typeof c?.slug === "string" && typeof c?.name === "string")
      .map((c: any) => ({ name: c.name, slug: c.slug }));
  } catch {
    // Structured data is not worth failing the page over. An absent ItemList costs a little SEO
    // signal; a thrown error costs the whole catalogue.
    return [];
  }
}

export default async function ProductsPage({ searchParams }: PageProps) {
  const resolvedParams = searchParams ? await searchParams : {};
  const categoryParam = typeof resolvedParams.category === "string" ? resolvedParams.category : undefined;

  if (categoryParam) {
    const remainingParams = new URLSearchParams();
    for (const [key, value] of Object.entries(resolvedParams)) {
      if (key !== "category" && value !== undefined) {
        if (Array.isArray(value)) {
          value.forEach((v) => remainingParams.append(key, v));
        } else {
          remainingParams.append(key, value);
        }
      }
    }
    const queryString = remainingParams.toString();
    const destination = `/products/${encodeURIComponent(categoryParam)}${queryString ? `?${queryString}` : ""}`;
    permanentRedirect(destination);
  }

  const categories = await fetchCategoryList();

  const itemListSchema =
    categories.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Fashion Categories on Hive — Kochi & Ernakulam",
          description:
            "Browse fashion categories available for 90-minute delivery across Kochi and Ernakulam on Hive.",
          url: `${SITE_URL}/products`,
          itemListElement: categories.map((cat, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: cat.name,
            url: `${SITE_URL}/products/${cat.slug}`,
          })),
        }
      : null;

  return (
    <>
      {itemListSchema && (
        <script
          type="application/ld+json"
          // `<` is escaped because the names in here now come from the categories table rather
          // than from literals in this file. JSON.stringify does not escape it, so a category
          // named with a literal "</script>" would otherwise close this block and have whatever
          // followed parsed as markup.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(itemListSchema).replace(/</g, "\\u003c"),
          }}
        />
      )}
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "/" },
          { name: "Products", url: "/products" },
        ]}
      />
      <ProductsClient />
    </>
  );
}
