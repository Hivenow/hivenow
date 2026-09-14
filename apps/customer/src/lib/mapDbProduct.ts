import { ProductCardData } from "@/lib/mockProducts";
import { calculateDisplayPricing } from "@/lib/pricing";

export function mapDbProduct(p: any): ProductCardData & {
  sizes: string[];
  stockBySize: Record<string, number>;
  boutiqueId?: string;
  boutique?: any;
  discountPercent?: number;
  categoryId?: string;
  categoryIds?: string[];
} {
  const { price, compareAtPrice, discountPercent } = calculateDisplayPricing(p);

  return {
    id: p._id,
    slug: p.slug,
    name: p.name,
    boutiqueName: p.boutiqueName || "Unknown Boutique",
    boutiqueId: p.boutiqueId,
    boutique: p.boutique,
    imageUrl: p.imageUrl || p.imageUrls?.[0] || "",
    price,
    compareAtPrice,
    discountPercent: discountPercent > 0 ? discountPercent : undefined,
    rating: p.rating || p.averageRating || undefined,
    reviewCount: p.reviewCount || undefined,
    sizes: p.sizes || [],
    stockBySize: p.stockBySize || {},
    deliveryLabel: p.deliveryLabel,
    categoryId: p.categoryId ? String(p.categoryId) : undefined,
    categoryIds: Array.isArray(p.categoryIds) ? p.categoryIds.map(String) : undefined,
  };
}
