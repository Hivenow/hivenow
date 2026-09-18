"use client";

import React from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/api";
import { useLocation } from "@/context/LocationContext";
import { toQueryCoords } from "@/lib/distance";
import { ExperienceBlockRenderer } from "@/components/home/ExperienceBlockRenderer";
import { CatalogLoadingState } from "@/components/catalog/CatalogLoadingState";
import { LayoutGrid } from "lucide-react";

export function ExperiencePageClient({ slug }: { slug: string }) {
  const { latitude, longitude, city } = useLocation();

  // resolveExperiencePayload returns a ResolvedExperience object, not an array
  // of blocks — the blocks live on `.blocks`. This was being treated as an
  // array directly, so `.length` was always undefined (defeating the
  // "not found" check below) and `.map` threw, taking down every
  // /experiences/[slug] page. HomeClient destructures the same payload.
  const experience = useQuery(api.customerHome.resolveExperiencePayload, {
    slug,
    city: city || undefined,
    ...toQueryCoords(latitude, longitude),
  });

  const experienceBlocks = experience?.blocks;

  if (experience === undefined) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <CatalogLoadingState count={8} />
      </div>
    );
  }

  if (!experienceBlocks || experienceBlocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-hive-dark">
        <LayoutGrid className="w-12 h-12 text-slate-300" />
        <h2 className="font-serif text-2xl font-bold">Experience Not Found</h2>
        <p className="text-slate-500 max-w-md text-center">
          We couldn&apos;t find the editorial experience you&apos;re looking for. It may have been unpublished or removed.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full">
      {experienceBlocks.map((block) => (
        <ExperienceBlockRenderer key={block.id} block={block} />
      ))}
    </div>
  );
}
