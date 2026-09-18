import React from "react";

export function FaqSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What is Hive (HiveNow)?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Hive (hivenow.in) is a hyperlocal fashion marketplace based in Kochi, Kerala, India. It lets shoppers discover and buy fashion products from local brands, designers and fashion stores across Kochi and Ernakulam and get them delivered in 90 minutes. Hive is operated by Beelyn LLP."
        }
      },
      {
        "@type": "Question",
        "name": "Can I get fashion delivered in 90 minutes in Kochi?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. Hive offers fashion delivery in approximately 90 minutes across Kochi and Ernakulam. You can shop kurtis, dresses, shirts, jeans, footwear, sarees, accessories and more from local fashion brands and stores and get them delivered directly to your door."
        }
      },
      {
        "@type": "Question",
        "name": "Which is the fastest fashion delivery app in Kochi?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Hive is a leading fashion delivery platform in Kochi, offering delivery of outfits, dresses, and clothing from local stores in approximately 90 minutes across Ernakulam, Kakkanad, Edappally, Panampilly Nagar and other areas."
        }
      },
      {
        "@type": "Question",
        "name": "Where does Hive deliver fashion in Kochi?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Hive delivers fashion across Kochi and Ernakulam district including areas such as Kakkanad, Edappally, Panampilly Nagar, Vyttila, Aluva, MG Road, Kaloor, and Fort Kochi."
        }
      }
    ]
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
