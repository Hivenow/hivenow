import { VerticalType } from "@hive/types";

export interface ProductReview {
  id: string;
  userName: string;
  rating: number;
  date: string;
  comment: string;
  sizePurchased: string;
}

export interface MeasurementRow {
  size: string;
  chest: string; // in inches
  waist: string;  // in inches
  shoulder: string; // in inches
  length: string; // in inches
  hip?: string;
  inseam?: string;
  width?: string;
  fitType?: string;
  stretch?: string;
}

export interface BoutiqueMeta {
  id: string;
  name: string;
  city: string;
  rating: number;
  reviewCount: number;
  verified: boolean;
  sameDayDelivery: boolean;
  latitude?: number;
  longitude?: number;
  deliveryRadiusKm?: number;
  trustTier?: string;
  /**
   * Trading hours, as stored on the boutique document
   * (convex/schema.ts boutiques.openingTime / closingTime, both optional
   * strings). The PDP shows these when a boutique is closed, and
   * getBoutiqueStatus reads them to decide whether it is open at all.
   */
  openingTime?: string;
  closingTime?: string;
  /**
   * Storefront identity fields, all present on the boutique document
   * (convex/schema.ts boutiques). The PDP's "about the boutique" panel reads
   * these — `slug` to link through to the shop page, and the rest for the
   * byline. They were missing here only because this interface predates that
   * panel; `ownerName` and `description` are required on the document, the
   * other two optional.
   */
  slug?: string;
  description?: string;
  logoUrl?: string;
  ownerName?: string;
}

export interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  description: string;
  boutique: BoutiqueMeta;
  price: number;
  compareAtPrice?: number;
  rating?: number;
  reviewCount?: number;
  occasionTags: string[];
  images: string[];
  videoUrl?: string;
  measurementMatrix: MeasurementRow[];
  sizes: string[];
  fitNote: string;
  deliveryInfo: string;
  sameDayEligible: boolean;
  returnsAccepted?: boolean;
  verticalType?: VerticalType;
  photoSource?: "in_store" | "ai_enhanced";
  details?: Record<string, string>;
  /**
   * The presentation half of the category's admin-defined attribute schema,
   * attached by getProduct. Absent when the category has no schema, in which
   * case the vertical's built-in spec keys decide what is shown.
   */
  attributeFields?: { key: string; label: string; unit?: string }[];
  inventory: Record<string, number>; // size to stock count
  featuredReviews: ProductReview[];
}

export const mockProductDetails: Record<string, ProductDetail> = {
  "varanasi-silk-katan-saree": {
    id: "prod_1",
    slug: "varanasi-silk-katan-saree",
    name: "Varanasi Silk Katan Saree",
    description: "Indulge in pure luxury with this authentic Varanasi Silk Saree, hand-woven using heritage Katan silk threads. Featuring a classic gold zari brocade border (chauras) and intricate floral motifs (butidar) across the pallu. Complete with matching unstitched blouse fabric.",
    boutique: {
      id: "boutique_1",
      name: "Zari & Loom",
      city: "Kochi",
      rating: 4.9,
      reviewCount: 42,
      verified: true,
      sameDayDelivery: true,
    },
    price: 12499,
    compareAtPrice: 16500,
    rating: 4.9,
    reviewCount: 42,
    occasionTags: ["wedding", "festival"],
    images: [
      "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=800&q=80",
    ],
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-fabric-of-a-silk-dress-fluttering-in-the-wind-41581-large.mp4",
    sizes: ["FS"], // Free Size
    fitNote: "Free size saree draping (6 yards including blouse piece). Blouse material requires custom stitching.",
    deliveryInfo: "Same-day delivery eligible for Kochi orders placed before 3:00 PM. Hand-delivered in a premium breathable cotton storage pouch.",
    sameDayEligible: true,
    inventory: {
      FS: 5,
    },
    measurementMatrix: [
      { size: "FS", chest: "N/A", waist: "N/A", shoulder: "N/A", length: "5.5 meters", hip: "N/A", fitType: "Draped", stretch: "None" },
    ],
    featuredReviews: [
      { id: "rev_1", userName: "Anjana K.", rating: 5, date: "May 24, 2026", comment: "The gold zari work is breathtakingly fine. Hand drapes beautifully. An absolute heritage piece!", sizePurchased: "FS" },
      { id: "rev_2", userName: "Priya Pillai", rating: 5, date: "April 18, 2026", comment: "Verified boutique delivery was so prompt. Packaged in a beautiful heritage storage box.", sizePurchased: "FS" },
    ],
  },
  "crimson-rose-embroidered-lehenga": {
    id: "prod_2",
    slug: "crimson-rose-embroidered-lehenga",
    name: "Crimson Rose Embroidered Lehenga",
    description: "A show-stopping bridal lehenga set crafted from premium velvet silk. Adorned with hand-embroidered crimson rose creepers, metallic salma-sitara embellishments, and custom badla work. Features a double-cancan structured skirt, standard padded blouse, and dual sheer organza dupattas.",
    boutique: {
      id: "boutique_3",
      name: "Chanderi House",
      city: "Trivandrum",
      rating: 4.8,
      reviewCount: 18,
      verified: true,
      sameDayDelivery: true,
    },
    price: 24999,
    compareAtPrice: 32000,
    rating: 4.8,
    reviewCount: 18,
    occasionTags: ["wedding"],
    images: [
      "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=800&q=80",
    ],
    sizes: ["S", "M", "L"],
    fitNote: "Semi-stitched skirt with adjustable drawstring waistband (fits waist 26\" to 34\"). Blouse has 2-inch side margins for easy alterations.",
    deliveryInfo: "Same-day delivery in Trivandrum city limits. Packaged securely in structured garment bags with padded hangers.",
    sameDayEligible: true,
    inventory: {
      S: 2,
      M: 3,
      L: 0,
    },
    measurementMatrix: [
      { size: "S", chest: "34\"", waist: "28\"", shoulder: "14.5\"", length: "42\"", hip: "36\"", fitType: "Structured", stretch: "None" },
      { size: "M", chest: "36\"", waist: "30\"", shoulder: "15\"", length: "43\"", hip: "38\"", fitType: "Structured", stretch: "None" },
      { size: "L", chest: "38\"", waist: "32\"", shoulder: "15.5\"", length: "44\"", hip: "40\"", fitType: "Structured", stretch: "None" },
    ],
    featuredReviews: [
      { id: "rev_3", userName: "Divya N.", rating: 5, date: "May 12, 2026", comment: "Extremely heavy embroidery, identical to high-end couture studios. Hand-measured fit was flawless.", sizePurchased: "S" },
    ],
  },
  "emerald-hand-painted-anarkali-kurti": {
    id: "prod_3",
    slug: "emerald-hand-painted-anarkali-kurti",
    name: "Emerald Hand-Painted Anarkali Kurti",
    description: "An elegant, flowy Anarkali kurta crafted from sustainable georgette silk. Features hand-painted golden ivy patterns along the tiered ghera (skirt panels) and premium potli-button neck detailing. Styled with cotton linings and structured full sleeves.",
    boutique: {
      id: "boutique_6",
      name: "Odhni Couture",
      city: "Kochi",
      rating: 4.7,
      reviewCount: 88,
      verified: false,
      sameDayDelivery: true,
    },
    price: 3499,
    compareAtPrice: 4999,
    rating: 4.7,
    reviewCount: 88,
    occasionTags: ["ethnic", "festival"],
    images: [
      "https://images.unsplash.com/photo-1596783074918-c84cb06531ca?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1609357605129-26f69add5d6e?auto=format&fit=crop&w=800&q=80",
    ],
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-fashion-woman-with-silver-glitter-makeup-40156-large.mp4",
    sizes: ["S", "M", "L", "XL"],
    fitNote: "Regular fit with fluid A-line flare. If you prefer a tailored waist fit, we recommend ordering your exact chest size.",
    deliveryInfo: "Same-day delivery eligible in Kochi. Delivered in eco-friendly cotton bags.",
    sameDayEligible: true,
    inventory: {
      S: 12,
      M: 8,
      L: 4,
      XL: 2,
    },
    measurementMatrix: [
      { size: "S", chest: "34\"", waist: "28\"", shoulder: "14\"", length: "48\"", hip: "38\"", fitType: "Regular", stretch: "Low" },
      { size: "M", chest: "36\"", waist: "30\"", shoulder: "14.5\"", length: "48\"", hip: "40\"", fitType: "Regular", stretch: "Low" },
      { size: "L", chest: "38\"", waist: "32\"", shoulder: "15\"", length: "49\"", hip: "42\"", fitType: "Regular", stretch: "Low" },
      { size: "XL", chest: "40\"", waist: "34\"", shoulder: "15.5\"", length: "49\"", hip: "44\"", fitType: "Regular", stretch: "Low" },
    ],
    featuredReviews: [
      { id: "rev_4", userName: "Aishwarya S.", rating: 5, date: "June 02, 2026", comment: "The hand-painted colors are extremely vibrant and didn't fade after wash. Highly recommended!", sizePurchased: "M" },
    ],
  },
  "saffron-linen-wide-leg-co-ord-set": {
    id: "prod_4",
    slug: "saffron-linen-wide-leg-co-ord-set",
    name: "Saffron Linen Wide-Leg Co-ord Set",
    description: "A breezy co-ord set made from organic flax linen. Comprises a double-breasted relaxed vest top with tortoiseshell buttons and high-waisted wide-leg trousers featuring front pleats, slant pockets, and a comfortable elasticated back waistband.",
    boutique: {
      id: "boutique_4",
      name: "Stitch Studio",
      city: "Kozhikode",
      rating: 4.6,
      reviewCount: 31,
      verified: true,
      sameDayDelivery: false,
    },
    price: 4299,
    compareAtPrice: 5500,
    rating: 4.6,
    reviewCount: 31,
    occasionTags: ["coords", "casual"],
    images: [
      "https://images.unsplash.com/photo-1609357605129-26f69add5d6e?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1596783074918-c84cb06531ca?auto=format&fit=crop&w=800&q=80",
    ],
    sizes: ["S", "M", "L"],
    fitNote: "Designed for a slightly oversized, relaxed fit. Pants length is optimized for flats or low heels.",
    deliveryInfo: "Scheduled standard shipping citywide in 24-48 hours.",
    sameDayEligible: false,
    inventory: {
      S: 5,
      M: 0,
      L: 4,
    },
    measurementMatrix: [
      { size: "S", chest: "35\"", waist: "26\"-29\"", shoulder: "15\"", length: "Vest: 22\" / Pants: 39\"", hip: "38\"", fitType: "Relaxed", stretch: "None" },
      { size: "M", chest: "37\"", waist: "28\"-31\"", shoulder: "15.5\"", length: "Vest: 22.5\" / Pants: 40\"", hip: "40\"", fitType: "Relaxed", stretch: "None" },
      { size: "L", chest: "39\"", waist: "30\"-33\"", shoulder: "16\"", length: "Vest: 23\" / Pants: 41\"", hip: "42\"", fitType: "Relaxed", stretch: "None" },
    ],
    featuredReviews: [
      { id: "rev_5", userName: "Kavya Menon", rating: 4, date: "May 29, 2026", comment: "Top-grade breathable linen. Fits nicely on the waist due to the elasticated back. Love the saffron color!", sizePurchased: "S" },
    ],
  },
  "silk-bandhani-midi-dress": {
    id: "prod_5",
    slug: "silk-bandhani-midi-dress",
    name: "Silk Bandhani Tie-Dye Midi Dress",
    description: "An editorial midi dress presenting authentic Rajasthani Bandhani knot tie-dye on fine mulberry silk. Highlighted with a deep v-neck, delicate flutter cap sleeves, a subtle tie belt, and a tiered asymmetric hemline that catches the wind beautifully.",
    boutique: {
      id: "boutique_2",
      name: "Brocade & Co",
      city: "Kochi",
      rating: 4.8,
      reviewCount: 15,
      verified: true,
      sameDayDelivery: true,
    },
    price: 6800,
    compareAtPrice: 8500,
    rating: 4.8,
    reviewCount: 15,
    occasionTags: ["date", "festival"],
    images: [
      "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=800&q=80",
    ],
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-fabric-of-a-silk-dress-fluttering-in-the-wind-41581-large.mp4",
    sizes: ["S", "M", "L"],
    fitNote: "Midi cut. Fits true to size. Fabric has no stretch, so refer to chest measurements carefully.",
    deliveryInfo: "Same-day delivery available for Kochi orders. Shipped in premium keepsake box envelopes.",
    sameDayEligible: true,
    inventory: {
      S: 3,
      M: 5,
      L: 2,
    },
    measurementMatrix: [
      { size: "S", chest: "34\"", waist: "28\"", shoulder: "14\"", length: "44\"", hip: "37\"", fitType: "Regular", stretch: "None" },
      { size: "M", chest: "36\"", waist: "30\"", shoulder: "14.5\"", length: "45\"", hip: "39\"", fitType: "Regular", stretch: "None" },
      { size: "L", chest: "38\"", waist: "32\"", shoulder: "15\"", length: "46\"", hip: "41\"", fitType: "Regular", stretch: "None" },
    ],
    featuredReviews: [
      { id: "rev_6", userName: "Neha J.", rating: 5, date: "May 10, 2026", comment: "True hand-tied bandhani work. Flows gorgeous and has a premium silk sheen. Perfect for evening dates!", sizePurchased: "M" },
    ],
  },
  "pastel-pink-chikankari-palazzo-suit": {
    id: "prod_6",
    slug: "pastel-pink-chikankari-palazzo-suit",
    name: "Pastel Pink Chikankari Palazzo Suit",
    description: "A classic Lucknowi Chikankari set hand-embroidered with white cotton threads on georgette fabric. Comprises a straight-cut long kurti, heavily embroidered georgette palazzos with inner lining, and a sheer chiffon dupatta with matching crochet borders.",
    boutique: {
      id: "boutique_5",
      name: "Awadh Handlooms",
      city: "Kochi",
      rating: 4.5,
      reviewCount: 56,
      verified: false,
      sameDayDelivery: true,
    },
    price: 5499,
    compareAtPrice: 6999,
    rating: 4.5,
    reviewCount: 56,
    occasionTags: ["casual", "festival"],
    images: [
      "https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=800&q=80",
    ],
    sizes: ["M", "L", "XL"],
    fitNote: "Straight, comfortable regular fit kurti. Palazzos have elasticated waistbands.",
    deliveryInfo: "Same-day delivery eligible in Kochi. Delivered in plastic-free cotton storage packaging.",
    sameDayEligible: true,
    inventory: {
      M: 8,
      L: 10,
      XL: 6,
    },
    measurementMatrix: [
      { size: "M", chest: "36\"", waist: "30\"", shoulder: "14.5\"", length: "Kurti: 44\" / Palazzo: 38\"", hip: "40\"", fitType: "Regular", stretch: "Low" },
      { size: "L", chest: "38\"", waist: "32\"", shoulder: "15\"", length: "Kurti: 44\" / Palazzo: 39\"", hip: "42\"", fitType: "Regular", stretch: "Low" },
      { size: "XL", chest: "40\"", waist: "34\"", shoulder: "15.5\"", length: "Kurti: 45\" / Palazzo: 40\"", hip: "44\"", fitType: "Regular", stretch: "Low" },
    ],
    featuredReviews: [
      { id: "rev_7", userName: "Anupama R.", rating: 4.5, date: "April 30, 2026", comment: "Very delicate hand-embroidery. Palazzos are fully lined and not sheer. Excellent daily or festive suit.", sizePurchased: "L" },
    ],
  },
  "mulberry-handloom-silk-saree": {
    id: "prod_7",
    slug: "mulberry-handloom-silk-saree",
    name: "Mulberry Handloom Silk Saree",
    description: "Exquisite pure handloom silk saree sourced directly from regional weavers. Highlighted by a contrast jacquard border, solid silver zari pallu, and a rich textured weave that is lightweight and extremely comfortable to drape.",
    boutique: {
      id: "boutique_1",
      name: "Zari & Loom",
      city: "Kochi",
      rating: 4.9,
      reviewCount: 22,
      verified: true,
      sameDayDelivery: false,
    },
    price: 14500,
    compareAtPrice: 19000,
    rating: 4.9,
    reviewCount: 22,
    occasionTags: ["festival", "wedding"],
    images: [
      "https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=800&q=80",
    ],
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-fabric-of-a-silk-dress-fluttering-in-the-wind-41581-large.mp4",
    sizes: ["FS"],
    fitNote: "Standard 5.5 meters drape width. Includes unstitched textured border blouse material.",
    deliveryInfo: "Dispatched in 24 hours. Hand-inspected and packed in a reusable wooden storage frame.",
    sameDayEligible: false,
    inventory: {
      FS: 3,
    },
    measurementMatrix: [
      { size: "FS", chest: "N/A", waist: "N/A", shoulder: "N/A", length: "5.5 meters", hip: "N/A", fitType: "Draped", stretch: "None" },
    ],
    featuredReviews: [
      { id: "rev_8", userName: "Aparna Dev", rating: 5, date: "May 03, 2026", comment: "Beautiful handloom weave, very soft and drapes easily. The silver pallu looks modern yet traditional.", sizePurchased: "FS" },
    ],
  },
  "royal-indigo-hand-block-print-maxi": {
    id: "prod_8",
    slug: "royal-indigo-hand-block-print-maxi",
    name: "Royal Indigo Hand-Block Print Maxi",
    description: "An effortless flared maxi dress featuring traditional indigo dabu block printing on premium combed cotton. Styled with a tiered skirt, tassel waist ties, side-seam pockets, and matching border overlays along the round neck.",
    boutique: {
      id: "boutique_2",
      name: "Indigo Jaipur",
      city: "Kochi",
      rating: 4.6,
      reviewCount: 112,
      verified: true,
      sameDayDelivery: true,
    },
    price: 3890,
    compareAtPrice: 4500,
    rating: 4.6,
    reviewCount: 112,
    occasionTags: ["casual"],
    images: [
      "https://images.unsplash.com/photo-1561414927-6d86591d0c4f?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=800&q=80",
    ],
    sizes: ["S", "M", "L", "XL"],
    fitNote: "Relaxed flared fit. Fabric is 100% cotton and will shrink slightly after the first wash, so if you are in between sizes we recommend sizing up.",
    deliveryInfo: "Same-day delivery eligible in Kochi. Delivered in recycled Kraft paper envelopes.",
    sameDayEligible: true,
    inventory: {
      S: 14,
      M: 12,
      L: 0,
      XL: 8,
    },
    measurementMatrix: [
      { size: "S", chest: "34\"", waist: "30\"", shoulder: "14\"", length: "52\"", hip: "40\"", fitType: "Relaxed", stretch: "Low" },
      { size: "M", chest: "36\"", waist: "32\"", shoulder: "14.5\"", length: "52\"", hip: "42\"", fitType: "Relaxed", stretch: "Low" },
      { size: "L", chest: "38\"", waist: "34\"", shoulder: "15\"", length: "53\"", hip: "44\"", fitType: "Relaxed", stretch: "Low" },
      { size: "XL", chest: "40\"", waist: "36\"", shoulder: "15.5\"", length: "53\"", hip: "46\"", fitType: "Relaxed", stretch: "Low" },
    ],
    featuredReviews: [
      { id: "rev_9", userName: "Rashmi M.", rating: 5, date: "May 15, 2026", comment: "So comfortable for hot summer afternoons! Indigo print is uniform. Pockets are a huge plus.", sizePurchased: "M" },
    ],
  },
};

export function getProductDetailBySlug(slug: string): ProductDetail | undefined {
  return mockProductDetails[slug];
}
