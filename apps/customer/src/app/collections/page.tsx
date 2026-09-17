import { Metadata } from "next";
import { CollectionsIndexClient } from "./CollectionsIndexClient";
import { BreadcrumbSchema } from "@/components/seo/BreadcrumbSchema";
import { constructMetadata } from "@/lib/seo";

export const metadata: Metadata = constructMetadata({
  // Root layout's title template already appends " | Hive" — no absoluteTitle here,
  // so this suffix must not be repeated (see getProductsMetadata for the same pattern).
  title: "Curated Collections",
  description: "Hand-picked edits from verified boutiques across Kochi & Ernakulam — shop lookbooks, seasonal drops and merchandiser favourites, delivered in 90 minutes.",
  path: "/collections",
});

export default function CollectionsPage() {
  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "/" },
          { name: "Collections", url: "/collections" },
        ]}
      />
      <CollectionsIndexClient />
    </>
  );
}
