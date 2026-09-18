import React from "react";

export function CategoryIntro({ intro, deliveryAreas }: { intro: string; deliveryAreas: string[] }) {
  if (!intro && (!deliveryAreas || deliveryAreas.length === 0)) return null;

  // Ensure "boutique" is replaced with "brand" or "store" in collection intros
  const sanitizedIntro = intro
    ? intro
        .replace(/Ernakulam's top boutiques/gi, "independent brands and stores across Kochi")
        .replace(/top boutiques/gi, "local brands and stores")
        .replace(/top local boutiques/gi, "independent local brands and stores")
        .replace(/curated local boutiques/gi, "local brands and stores")
        .replace(/boutiques/gi, "brands and stores")
        .replace(/boutique/gi, "store")
    : "";

  return (
    <div className="mb-12">
      <h2 className="text-2xl font-serif font-bold text-hive-dark mb-4">About this Collection</h2>
      <div className="prose prose-stone max-w-none text-hive-text-muted leading-relaxed">
        {sanitizedIntro && <p className="mb-4">{sanitizedIntro}</p>}
        {deliveryAreas && deliveryAreas.length > 0 && (
          <p>
            <strong>Serving Ernakulam:</strong> Fast, same-day delivery to {deliveryAreas.slice(0, -1).join(", ")}
            {deliveryAreas.length > 1 ? ` and ${deliveryAreas[deliveryAreas.length - 1]}` : ""} and surrounding neighborhoods.
          </p>
        )}
      </div>
    </div>
  );
}
