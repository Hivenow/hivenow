import React from "react";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../../convex/_generated/api";
import { SITE_URL } from "@/lib/seo";
import { mapDbProduct } from "@/lib/mapDbProduct";
import { BreadcrumbSchema } from "@/components/seo/BreadcrumbSchema";
import {
  BoutiqueStorefrontClient,
  PublicBoutique,
  CategoryInfo,
} from "./BoutiqueStorefrontClient";

interface Props {
  params: Promise<{ slug: string }>;
}

export const revalidate = 60; // ISR cache for 60 seconds

function getConvexClient(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  return new ConvexHttpClient(url);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const client = getConvexClient();
  if (!client) return { title: "Shop — Hive" };

  try {
    const boutique = await client.query(api.boutiques.getBoutiquePublicProfile, { slug });
    if (!boutique) {
      return {
        title: "Shop Not Found | Hive",
        robots: { index: false, follow: false },
      };
    }

    const city = boutique.city || "Kochi";
    const title = `${boutique.boutiqueName} — Store in ${city} | Shop Online on Hive`;
    const description =
      boutique.description ||
      `Shop fashion from ${boutique.boutiqueName} in ${city}, Kerala. Kurtis, sarees, dresses & accessories delivered to your door in 90 minutes via Hive.`;

    const shareImage = boutique.bannerUrl || boutique.logoUrl || "/icon-512x512.png";

    return {
      title,
      description,
      alternates: {
        canonical: `${SITE_URL}/shop/${slug}`,
      },
      openGraph: {
        title,
        description,
        url: `${SITE_URL}/shop/${slug}`,
        siteName: "Hive",
        images: [
          {
            url: shareImage,
            width: 1200,
            height: 630,
            alt: `${boutique.boutiqueName} Storefront`,
          },
        ],
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [shareImage],
      },
    };
  } catch (err) {
    console.error("Failed to generate metadata for shop:", err);
    return { title: "Shop — Hive" };
  }
}

export default async function BoutiqueStorefrontPage({ params }: Props) {
  const { slug } = await params;
  const client = getConvexClient();

  if (!client) {
    return notFound();
  }

  let boutique: any = null;
  let rawProducts: any[] = [];
  let rawCategories: any[] = [];

  try {
    boutique = await client.query(api.boutiques.getBoutiquePublicProfile, { slug });

    if (!boutique) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
          <h1 className="text-2xl font-bold text-stone-800">Shop Not Available</h1>
          <p className="text-stone-600 max-w-md">
            This shop is not currently active on Hive. They may be updating their catalog or temporarily closed.
          </p>
        </div>
      );
    }

    const [productsRes, categoriesRes] = await Promise.all([
      client.query(api.products.getActiveProducts, { boutiqueId: boutique._id }),
      client.query(api.categories.getCategories, { onlyActive: true }),
    ]);

    rawProducts = productsRes || [];
    rawCategories = categoriesRes || [];
  } catch (error) {
    console.error("Failed to fetch boutique storefront data:", error);
    return notFound();
  }

  const products = rawProducts.map(mapDbProduct);

  const categories: CategoryInfo[] = rawCategories
    .filter((c: any) => c.slug && c.name)
    .map((c: any) => ({
      _id: c._id,
      name: c.name,
      slug: c.slug,
    }));



  const publicBoutique: PublicBoutique = {
    _id: boutique._id,
    slug: boutique.slug || slug,
    boutiqueName: boutique.boutiqueName,
    description: boutique.description,
    logoUrl: boutique.logoUrl,
    bannerUrl: boutique.bannerUrl,
    address: boutique.address,
    city: boutique.city,
    state: boutique.state,
    pincode: boutique.pincode,
    latitude: boutique.latitude,
    longitude: boutique.longitude,
    deliveryRadiusKm: boutique.deliveryRadiusKm,
    isAcceptingOrders: boutique.isAcceptingOrders,
    merchantTier: boutique.merchantTier,
    storeCategory: boutique.storeCategory,
    createdAt: boutique.createdAt,
    averageRating: boutique.averageRating,
    reviewCount: boutique.reviewCount,
  };

  const city = boutique.city || "Kochi";
  const displayAddress = boutique.address || `${city}, Kerala`;

  // ── JSON-LD Structured Data: LocalBusiness / ClothingStore ───────────────
  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "ClothingStore",
    "@id": `${SITE_URL}/shop/${slug}#store`,
    name: boutique.boutiqueName,
    description:
      boutique.description ||
      `${boutique.boutiqueName} is a local fashion store in ${city}, Kerala offering express fashion delivery via Hive.`,
    url: `${SITE_URL}/shop/${slug}`,
    image: boutique.bannerUrl || boutique.logoUrl || `${SITE_URL}/icon-512x512.png`,
    priceRange: "₹₹",
    currenciesAccepted: "INR",
    paymentAccepted: "Cash, Credit Card, UPI, Net Banking",
    address: {
      "@type": "PostalAddress",
      streetAddress: boutique.address || city,
      addressLocality: city,
      addressRegion: boutique.state || "Kerala",
      postalCode: boutique.pincode || "682016",
      addressCountry: "IN",
    },
    ...(boutique.latitude && boutique.longitude
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: boutique.latitude,
            longitude: boutique.longitude,
          },
        }
      : {}),
    areaServed: [
      {
        "@type": "City",
        name: "Kochi",
      },
      {
        "@type": "City",
        name: "Ernakulam",
      },
    ],
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ],
        opens: "10:00",
        closes: "20:30",
      },
    ],
  };

  // ── JSON-LD Structured Data: FAQPage ─────────────────────────────────────
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `How quickly does Hive deliver from ${boutique.boutiqueName}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Orders placed on Hive are packed directly by ${boutique.boutiqueName}'s staff in Kochi and dispatched via dedicated express couriers in approximately 90 minutes.`,
        },
      },
      {
        "@type": "Question",
        name: `Are products from ${boutique.boutiqueName} authentic?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Yes, 100% authentic. All products come directly from ${boutique.boutiqueName}'s physical showroom inventory with original brand tags.`,
        },
      },
      {
        "@type": "Question",
        name: `Can I visit ${boutique.boutiqueName}'s physical showroom?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Yes! ${boutique.boutiqueName} operates a physical store at ${displayAddress}. You can visit in person or order online through Hive for 90-minute delivery.`,
        },
      },
      {
        "@type": "Question",
        name: `What is the return and exchange policy for ${boutique.boutiqueName}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Hive provides hassle-free doorstep returns and size exchanges within 2 days of delivery across Kochi and Ernakulam.`,
        },
      },
    ],
  };

  return (
    <>
      {/* Structured Data: LocalBusiness / ClothingStore */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(localBusinessSchema).replace(/</g, "\\u003c"),
        }}
      />

      {/* Structured Data: FAQPage */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqSchema).replace(/</g, "\\u003c"),
        }}
      />

      {/* Structured Data: Breadcrumbs */}
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "/" },
          { name: "Stores", url: "/products" },
          { name: boutique.boutiqueName, url: `/shop/${slug}` },
        ]}
      />

      <BoutiqueStorefrontClient
        boutique={publicBoutique}
        products={products}
        categories={categories}
      />
    </>
  );
}
