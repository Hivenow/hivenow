import { displayPricing } from "../shared/catalog";

function assertEqual(actual: any, expected: any, message?: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message || ""} (expected ${expected}, got ${actual})`);
  }
}

console.log("Running Price Filtering & Normalization Unit Tests...");

// Test 1: Standard product in paise (₹2,469)
const productPaise = {
  _id: "prod_1",
  name: "Western Midi Dress",
  price: 246900, // 2,469 rupees in paise
};
const pricing1 = displayPricing(productPaise);
assertEqual(pricing1.price, 2469, "Product price in paise must normalize to ₹2,469");

// Test 2: Above ₹6,000 filter on ₹2,469 product
const minPrice6k = 6000;
const passes6k = pricing1.price >= minPrice6k;
assertEqual(passes6k, false, "A ₹2,469 product must NOT pass 'Above ₹6,000' filter");

// Test 3: ₹1,500 - ₹3,000 filter on ₹2,469 product
const passes1500to3000 = pricing1.price >= 1500 && pricing1.price <= 3000;
assertEqual(passes1500to3000, true, "A ₹2,469 product MUST pass '₹1,500 – ₹3,000' filter");

// Test 4: Under ₹1,500 filter on ₹2,469 product
const passesUnder1500 = pricing1.price <= 1500;
assertEqual(passesUnder1500, false, "A ₹2,469 product must NOT pass 'Under ₹1,500' filter");

// Test 5: Genuine luxury item in paise (₹7,999)
const luxuryProduct = {
  _id: "prod_2",
  name: "Designer Silk Saree",
  price: 799900,
};
const pricingLuxury = displayPricing(luxuryProduct);
assertEqual(pricingLuxury.price, 7999, "Luxury product price must normalize to ₹7,999");
assertEqual(pricingLuxury.price >= minPrice6k, true, "A ₹7,999 product MUST pass 'Above ₹6,000' filter");

// Test 6: Discounted product (MRP ₹7,000, Selling ₹4,500)
const discountedProduct = {
  _id: "prod_3",
  name: "Embroidered Anarkali",
  price: 700000,        // MRP in paise
  discountPrice: 450000 // Discount price in paise
};
const pricingDiscounted = displayPricing(discountedProduct);
assertEqual(pricingDiscounted.price, 4500, "Selling price should reflect discount ₹4,500");
assertEqual(pricingDiscounted.price >= 3000 && pricingDiscounted.price <= 6000, true, "₹4,500 discounted item MUST match '₹3,000 – ₹6,000'");
assertEqual(pricingDiscounted.price >= minPrice6k, false, "₹4,500 discounted item must NOT match 'Above ₹6,000' even if base price was ₹7,000");

// Test 7: Legacy product stored in rupees (<= 10000)
const legacyRupeesProduct = {
  _id: "prod_4",
  name: "Handloom Cotton Kurti",
  price: 1800,
};
const pricingLegacy = displayPricing(legacyRupeesProduct);
assertEqual(pricingLegacy.price, 1800, "Legacy price stored in rupees should remain 1800");
assertEqual(pricingLegacy.price >= 1500 && pricingLegacy.price <= 3000, true, "Legacy ₹1,800 item MUST match '₹1,500 – ₹3,000'");

console.log("[PASS] All 7 Price Filtering & Normalization unit tests passed successfully!");
