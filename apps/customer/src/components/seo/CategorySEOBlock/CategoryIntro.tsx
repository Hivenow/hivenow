import React from "react";

export function CategoryIntro({ intro, deliveryAreas }: { intro: string; deliveryAreas: string[] }) {
  if (!intro && (!deliveryAreas || deliveryAreas.length === 0)) return null;

  // Ensure "Ernakulam's top boutiques" or cliché "top boutiques" is NEVER displayed in collection intros
  const sanitizedIntro = intro
    ? intro
        .replace(/Ernakulam's top boutiques/gi, "curated local boutiques across Kochi")
        .replace(/top boutiques/gi, "curated local boutiques")
        .replace(/top local boutiques/gi, "independent local boutiques")
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
