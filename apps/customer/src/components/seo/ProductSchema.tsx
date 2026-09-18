import React from "react";
import { SITE_URL } from "@/lib/seo";

interface ProductSchemaProps {
  product: {
    _id?: string;
    name: string;
    description?: string;
    slug: string;
    price?: number;
    images?: string[];
    coverImage?: string;
    boutiqueName?: string;
    boutique?: {
      name?: string;
      boutiqueName?: string;
    };
    isUnavailable?: boolean;
    isAvailable?: boolean;
  };
}

export function ProductSchema({ product }: ProductSchemaProps) {
  const images =
    product.images && product.images.length > 0
      ? product.images
      : product.coverImage
        ? [product.coverImage]
        : [`${SITE_URL}/icon-512x512.png`];

  const boutiqueName =
    product.boutiqueName ||
    product.boutique?.boutiqueName ||
    product.boutique?.name ||
    "Hive Store";

  const inStock = !product.isUnavailable && product.isAvailable !== false;
  const canonicalUrl = `${SITE_URL}/products/${product.slug}`;

  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description:
      product.description ||
      `Buy ${product.name} from local store ${boutiqueName} in Kochi on Hive. Express 1-2 hour delivery available across Ernakulam.`,
    image: images,
    sku: product._id || product.slug,
    brand: {
      "@type": "Brand",
      name: boutiqueName,
    },
    offers: {
      "@type": "Offer",
      url: canonicalUrl,
      priceCurrency: "INR",
      price: product.price || 0,
      priceValidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      availability: inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: {
        "@type": "Organization",
        name: boutiqueName,
      },
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
