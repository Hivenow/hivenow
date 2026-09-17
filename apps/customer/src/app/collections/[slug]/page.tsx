import { notFound } from "next/navigation";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/api";
import { Metadata } from "next";
import { CollectionPageClient } from "./CollectionPageClient";
import { BreadcrumbSchema } from "@/components/seo/BreadcrumbSchema";
import { SITE_URL } from "@/lib/seo";

interface Props {
  params: Promise<{ slug: string }>;
}

// Collections are merchandiser-curated and can change at any time (add/remove
// products, unpublish). No ISR caching, matching /products/[slug].
export const revalidate = 0;

/**
 * Existence check only — no location. customerHome.getCollection accepts
 * optional city/lat/lng and returns the same `collection` regardless; the
 * product list it returns without them is just not serviceability-annotated,
 * which doesn't matter here since CollectionPageClient does its own
 * location-aware fetch for the actual grid. This call exists purely to 404
 * unknown slugs and to name the page for metadata.
 */
function getConvexClient(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  return url ? new ConvexHttpClient(url) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const client = getConvexClient();
  if (!client) return {};

  try {
    const data = await client.query(api.customerHome.getCollection, { slug });
    if (!data) return {};

    const { collection } = data;
    return {
      title: collection.name,
      description:
        collection.description || `Shop the ${collection.name} collection — hand-picked styles from verified boutiques on Hive.`,
      alternates: {
        canonical: `${SITE_URL}/collections/${slug}`,
      },
    };
  } catch {
    return {};
  }
}

export default async function CollectionPage({ params }: Props) {
  const { slug } = await params;

  const client = getConvexClient();
  if (!client) return notFound();

  let data = null;
  try {
    data = await client.query(api.customerHome.getCollection, { slug });
  } catch (error) {
    console.error("Failed to fetch collection:", error);
  }

  // getCollection returns null for a missing slug or an unpublished collection.
  // Every collection slug used to be redirected to /products/[slug], which only
  // resolves categories and products — a collection was never one of those, so
  // every curated collection 404'd the moment a shopper clicked through to it.
  if (!data) {
    return notFound();
  }

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "/" },
          { name: "Collections", url: "/collections" },
          { name: data.collection.name, url: `/collections/${slug}` },
        ]}
      />
      <CollectionPageClient slug={slug} />
    </>
  );
}
