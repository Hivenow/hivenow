import React from "react";
import { CategoryContent } from "@/lib/content/categoryContent";
import { CategoryIntro } from "./CategoryIntro";
import { CategoryFeatures } from "./CategoryFeatures";
import { CategoryFAQ } from "./CategoryFAQ";

export function CategorySEOBlock({ content }: { content: CategoryContent | null }) {
  if (!content) return null;

  return (
    <section className="mt-20 pt-16 border-t border-hive-border/40 bg-slate-50/50">
      <div className="max-w-4xl mx-auto px-6 lg:px-8">
        <CategoryIntro intro={content.intro} deliveryAreas={content.deliveryAreas} />
        <CategoryFeatures features={content.whyHive} />
        <CategoryFAQ faqs={content.faqs} />
      </div>
    </section>
  );
}
