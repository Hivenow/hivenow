import React from "react";
import { SITE_URL } from "@/lib/seo";

export function LocalBusinessSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "Hive",
    image: `${SITE_URL}/logo.png`,
    "@id": SITE_URL,
    url: SITE_URL,
    telephone: "+917356019103",
    email: "support@hivenow.in",
    priceRange: "₹₹",
    address: {
      "@type": "PostalAddress",
      streetAddress: "55/4379, Door No. 3623, Valanjambalam Junction, Kochi M.G. Road",
      addressLocality: "Ernakulam",
      addressRegion: "Kerala",
      postalCode: "682016",
      addressCountry: "IN",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: 9.9678,
      longitude: 76.2999,
    },
    openingHoursSpecification: {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ],
      opens: "09:00",
      closes: "22:00",
    },
    description: "Hyperlocal fashion delivery service across Kochi and Ernakulam, partnering with top local brands and stores.",
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
