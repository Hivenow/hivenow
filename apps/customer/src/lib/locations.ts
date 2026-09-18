export interface LocationData {
  slug: string;
  name: string;
  district: string;
  tagline: string;
  avgDeliveryTime: string;
  landmarks: string[];
  metaTitle: string;
  metaDescription: string;
  heroHeader: string;
  geo?: {
    latitude: number;
    longitude: number;
  };
}

export const KOCHI_LOCATIONS: Record<string, LocationData> = {
  kakkanad: {
    slug: "kakkanad",
    name: "Kakkanad",
    district: "Ernakulam",
    tagline: "Same-day fashion delivery to Kakkanad, Kochi's tech hub.",
    avgDeliveryTime: "Within 2 hours",
    landmarks: ["Infopark Kochi", "SmartCity Kochi", "Rajagiri Valley", "Collectorate Junction"],
    metaTitle: "Fashion Delivered in Hours to Kakkanad | Hive Kochi",
    metaDescription: "Get the latest local fashion delivered to Kakkanad, Kochi in hours. Skip the wait and shop premium dresses, sarees, and menswear on Hive.",
    heroHeader: "Fashion Delivered to Kakkanad in Hours",
    geo: {
      latitude: 10.0159,
      longitude: 76.3419,
    },
  },
  edappally: {
    slug: "edappally",
    name: "Edappally",
    district: "Ernakulam",
    tagline: "Premium fashion delivered to your doorstep in Edappally, Kochi's retail center.",
    avgDeliveryTime: "Within 90 minutes",
    landmarks: ["Lulu Mall", "Edappally Toll", "Obon", "Changampuzha Park"],
    metaTitle: "Fashion Delivered in Hours to Edappally | Hive Kochi",
    metaDescription: "Shop fashion collections online and get delivery in hours to Edappally, Kochi. Find premium ethnic wear and modern outfits on Hive.",
    heroHeader: "Fashion Delivered to Edappally in Hours",
    geo: {
      latitude: 10.0236,
      longitude: 76.3117,
    },
  },
  "panampilly-nagar": {
    slug: "panampilly-nagar",
    name: "Panampilly Nagar",
    district: "Ernakulam",
    tagline: "Elite fashion delivered in hours to Panampilly Nagar, Kochi's trendiest residential hub.",
    avgDeliveryTime: "Within 2 hours",
    landmarks: ["Panampilly Nagar Park", "Main Avenue", "GCDA Shopping Complex", "Manorama Junction"],
    metaTitle: "Fashion Delivered in Hours to Panampilly Nagar | Hive Kochi",
    metaDescription: "Get premium designer clothing and brand collections delivered to Panampilly Nagar, Kochi in hours. Experience instant styling with Hive.",
    heroHeader: "Fashion Delivered to Panampilly Nagar in Hours",
    geo: {
      latitude: 9.9625,
      longitude: 76.2995,
    },
  },
  vyttila: {
    slug: "vyttila",
    name: "Vyttila",
    district: "Ernakulam",
    tagline: "Local fashion delivered in hours to Vyttila, Kochi's primary transit hub.",
    avgDeliveryTime: "Within 2 hours",
    landmarks: ["Vyttila Mobility Hub", "Vyttila Junction", "Gold Souk Grande", "Toc H Public School"],
    metaTitle: "Fashion Delivered in Hours to Vyttila | Hive Kochi",
    metaDescription: "Shop high-quality fashion from local stores and enjoy same-day delivery in Vyttila, Kochi. Experience ultra-fast fashion delivery with Hive.",
    heroHeader: "Fashion Delivered to Vyttila in Hours",
    geo: {
      latitude: 9.9678,
      longitude: 76.3183,
    },
  },
  aluva: {
    slug: "aluva",
    name: "Aluva",
    district: "Ernakulam",
    tagline: "Premium wear delivered to your door in Aluva, Kochi's major gateway.",
    avgDeliveryTime: "Within 3 hours",
    landmarks: ["Aluva Manappuram", "Aluva Railway Station", "Federal Bank Head Office", "Marthanda Varma Bridge"],
    metaTitle: "Fashion Delivered in Hours to Aluva | Hive Kochi",
    metaDescription: "Get fashion from local brands and stores delivered to your doorstep in Aluva, Kochi in hours. Discover ethnic wear, shirts, and accessories on Hive.",
    heroHeader: "Fashion Delivered to Aluva in Hours",
    geo: {
      latitude: 10.1076,
      longitude: 76.3516,
    },
  },
};
