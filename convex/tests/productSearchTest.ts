import { rankProducts, parseQuery, stem } from "../lib/productSearch";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function names(query: string): string[] {
  return rankProducts(query, products, ctx).map((r) => r.product.name);
}

console.log("Running Product Search Relevance Tests...");

// Fixture mirrors real catalogue shapes: names that omit the category word, details objects,
// hyphenated and spaced spellings of the same garment.
const categories = [
  { _id: "cat_women", name: "Women's", slug: "womens-fashion" },
  { _id: "cat_coord", name: "Co-ord Sets", slug: "co-ord-sets", parentId: "cat_women" },
  { _id: "cat_kurti", name: "Kurtis", slug: "kurtis", parentId: "cat_women" },
  { _id: "cat_saree", name: "Sarees", slug: "sarees", parentId: "cat_women" },
];
const products = [
  { _id: "p1", name: "Ready Made Salwar", categoryId: "cat_coord", boutiqueId: "b_thabu", material: "Mul Chanderi", details: { color: "Pastel Blue" }, createdAt: 1 },
  { _id: "p2", name: "3-piece Crush Fabric Salwar Set", categoryId: "cat_coord", boutiqueId: "b_dharees", details: { color: "Rani Pink", neckType: "V-Neck" }, createdAt: 2 },
  { _id: "p3", name: "Mogra Sunshine Embroidered Kurta", categoryId: "cat_kurti", boutiqueId: "b_velvet", material: "Cotton", details: { color: "Yellow", neckType: "V-Neck" }, createdAt: 3 },
  { _id: "p4", name: "Royal Red Cotton Kurti", categoryId: "cat_kurti", boutiqueId: "b_dharees", details: { color: "Red", neckType: "Round Neck" }, createdAt: 4 },
  { _id: "p5", name: "Premium ivory co- ord set", categoryId: "cat_coord", boutiqueId: "b_dharees", details: { color: "Ivory", neckType: "Mandarin Collar" }, createdAt: 5 },
  { _id: "p6", name: "Saree", categoryId: "cat_saree", boutiqueId: "b_thabu", material: "Dolla Silk", description: "Mentioned in our festive edit.", createdAt: 6 },
];
const ctx = {
  categoriesById: new Map(categories.map((c) => [c._id, c])),
  boutiqueNamesById: new Map([
    ["b_thabu", "THABU & PATHU"],
    ["b_dharees", "Dharees Designs"],
    ["b_velvet", "VelvetVine Boutique"],
  ]),
};

// Stemming is consistent on both sides.
assert(stem("sarees") === "saree" && stem("kurtis") === "kurti" && stem("sets") === "set", "plurals stem to base form");
assert(stem("dresses") === "dress" && stem("glass") === "glass", "es/ss endings handled");

// The reported bug: a multi-word query used to be scored as one exact phrase, returning nothing.
const salwarSets = names("Salwar Sets");
assert(salwarSets.includes("Ready Made Salwar"), "'Salwar Sets' must find Ready Made Salwar");
assert(salwarSets[0] === "3-piece Crush Fabric Salwar Set", "the product containing both words ranks first");

// Synonyms reach products that never use the shopper's word.
assert(names("churidar").includes("Ready Made Salwar"), "'churidar' finds salwars");
assert(names("sari").includes("Saree"), "'sari' finds sarees");
const kurta = names("kurta");
assert(kurta[0] === "Mogra Sunshine Embroidered Kurta" && kurta.includes("Royal Red Cotton Kurti"), "shopper's own word ranks before its synonym");

// Words are matched in any field and any order.
assert(names("kurti yellow").includes("Mogra Sunshine Embroidered Kurta"), "colour from details + synonym, reversed order");
assert(names("thabu").length === 2, "shop name finds that shop's products");
assert(names("chanderi")[0] === "Ready Made Salwar", "material matches");

// Spelling variants of the same garment meet.
assert(names("co-ord").includes("Premium ivory co- ord set") && names("coord").includes("Premium ivory co- ord set"), "co-ord / coord / 'co- ord' meet");
const vneck = names("v neck");
assert(vneck.length === 2 && !vneck.includes("Royal Red Cotton Kurti"), "'v neck' matches V-Neck only, not every neck");

// Type-ahead prefixes work, but synonym prefixes and long-text prefixes do not create noise.
assert(names("sal").includes("Ready Made Salwar"), "prefix of shopper's word matches");
assert(!names("men").includes("Premium ivory co- ord set"), "'men' must not match 'Mandarin collar' via a synonym prefix");
assert(!names("men").includes("Saree"), "'men' must not match 'Mentioned' in a description");

// Soft words never exclude; unrelated words return nothing.
assert(names("saree collection").includes("Saree"), "soft word does not exclude");
assert(names("xyzqq").length === 0, "gibberish returns nothing");
assert(parseQuery("  ").length === 0, "blank query has no terms");

// When no product has every word, related products are returned rather than nothing.
const related = rankProducts("red salwar", products, ctx);
assert(related.length > 0 && related.every((r) => !r.matchedAllTerms), "partial matches returned and flagged");

console.log("✅ All product search relevance tests passed.");
