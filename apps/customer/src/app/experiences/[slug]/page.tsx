import React from "react";
import { Metadata } from "next";
import { ExperiencePageClient } from "./ExperiencePageClient";
import { SITE_URL } from "@/lib/seo";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const title = slug.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  const canonicalUrl = `${SITE_URL}/experiences/${slug}`;
  const description = `Explore the ${title} editorial experience. Discover fashion collections, trends, and stories in Kochi on Hive.`;

  return {
    // The root layout appends " | Hive"; carrying one here doubled it. openGraph and twitter
    // below keep the brand, since the template does not reach them.
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `${title} | Hive`,
      description,
      url: canonicalUrl,
      siteName: "Hive",
      type: "website",
      images: [`${SITE_URL}/icon-512x512.png`],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | Hive`,
      description,
      images: [`${SITE_URL}/icon-512x512.png`],
    },
  };
}

export default async function ExperiencePage({ params }: Props) {
  const { slug } = await params;
  return (
    <div className="w-full bg-white">
      <ExperiencePageClient slug={slug} />
    </div>
  );
}
