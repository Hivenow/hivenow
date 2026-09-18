import React from "react";
import { SITE_URL } from "@/lib/seo";

export function OrganizationSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Hive",
    alternateName: "HiveNow",
    legalName: "BEELYN LLP",
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    foundingDate: "2024",
    description: "Hive is a hyperlocal fashion marketplace in Kochi, Kerala. It connects customers with local fashion brands and stores across Kochi and Ernakulam for 90-minute delivery.",
    sameAs: [
      "https://www.instagram.com/hivenow.in",
      "https://www.hivenow.in",
    ],
    address: {
      "@type": "PostalAddress",
      streetAddress: "55/4379, Door No. 3623, Valanjambalam Junction, Kochi M.G. Road",
      addressLocality: "Ernakulam",
      addressRegion: "Kerala",
      postalCode: "682016",
      addressCountry: "IN",
    },
    contactPoint: {
      "@type": "ContactPoint",
      telephone: "+917356019103",
      contactType: "customer service",
      email: "support@hivenow.in",
      areaServed: "IN",
      availableLanguage: ["en", "ml"],
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
