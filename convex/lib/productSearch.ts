// Relevance matching for customer product search. Pure functions only — no Convex ctx — so the
// ranking can be tested against catalogue snapshots.
//
// Scans every candidate product in memory. That is right while the catalogue is in the hundreds;
// past a few thousand active products, move candidate recall to a search index over a combined
// text field and keep this module for ranking only.

export interface SearchableProduct {
  _id: unknown;
  name?: string;
  categoryId?: unknown;
  boutiqueId?: unknown;
  description?: string;
  material?: string;
  materialType?: string;
  details?: Record<string, unknown>;
  tags?: unknown;
  story?: string;
  createdAt?: number;
}

export interface SearchCategory {
  name?: string;
  slug?: string;
  parentId?: unknown;
}

export interface SearchContext {
  categoriesById: Map<string, SearchCategory>;
  boutiqueNamesById: Map<string, string>;
}

export interface ScoredProduct<P> {
  product: P;
  score: number;
  matchedAllTerms: boolean;
}

// Shoppers type these, but they narrow nothing on their own. They still lift products that
// contain them; they just never exclude a product for lacking them.
const SOFT_WORDS = new Set([
  "set", "wear", "collection", "style", "outfit", "look", "new", "latest", "best",
  "online", "buy", "shop", "design", "designer", "fashion", "clothing", "clothes",
]);

const PREFIX_MIN_FIELD_WEIGHT = 5;

const STOP_WORDS = new Set(["and", "or", "the", "for", "with", "in", "of", "a", "an", "to", "on", "by", "under"]);

// Each group is one garment or idea described in the ways Kerala shoppers and sellers actually
// write it. Entries are compared after stem(), so list the base form.
const SYNONYM_GROUPS: string[][] = [
  ["salwar", "shalwar", "salwaar", "churidar", "chudidar", "chudi", "kameez", "suit"],
  ["kurti", "kurta", "kurtha", "tunic"],
  ["saree", "sari", "saari"],
  ["lehenga", "lehnga", "lehanga", "ghagra", "chaniya"],
  ["coord", "cord", "twinset"],
  ["frock", "dress", "onepiece"],
  ["gown", "maxi"],
  ["top", "blouse"],
  ["tshirt", "tee"],
  ["trouser", "pant", "pyjama", "pajama"],
  ["jean", "denim"],
  ["dupatta", "stole", "shawl", "chunni", "scarf"],
  ["nightwear", "nighty", "nightie", "nightdress", "nightgown"],
  ["handbag", "bag", "purse", "tote", "sling", "clutch"],
  ["jewellery", "jewelry", "earring", "necklace", "bangle", "jhumka"],
  ["bedsheet", "bedspread", "bedcover"],
  ["ethnic", "traditional"],
  ["kid", "child", "children", "boy", "girl", "baby"],
  ["women", "woman", "ladies", "lady", "womens"],
  ["men", "man", "gents", "mens"],
  ["unstitched", "material"],
];

export function stem(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
  if (/(ss|sh|ch|x|z)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

const synonymsByWord = new Map<string, string[]>();
for (const group of SYNONYM_GROUPS) {
  const stemmed = group.map(stem);
  for (const word of stemmed) synonymsByWord.set(word, stemmed);
}

/**
 * Lowercased, stemmed words. Joined forms are emitted too, so "co-ord" meets "coord" and a lone
 * letter meets its neighbour: "V Neck", "V-Neck" and "v neck" all produce "vneck".
 */
export function wordsOf(text: string): string[] {
  const lower = text.toLowerCase();
  const spaced = lower.split(/[^a-z0-9]+/).filter(Boolean);
  const hyphenJoined = lower
    .split(/[^a-z0-9-]+/)
    .filter((w) => w.includes("-"))
    .map((w) => w.replace(/-/g, ""));
  const letterJoined = spaced
    .map((w, i) => (w.length === 1 && spaced[i + 1] ? w + spaced[i + 1] : ""))
    .filter(Boolean);
  return [...spaced, ...hyphenJoined, ...letterJoined].map(stem);
}

export interface QueryTerm {
  raw: string;
  variants: Set<string>;
  soft: boolean;
}

export function parseQuery(query: string): QueryTerm[] {
  const seen = new Set<string>();
  const terms: QueryTerm[] = [];
  for (const word of wordsOf(query)) {
    if (STOP_WORDS.has(word) || seen.has(word)) continue;
    if (word.length < 2) continue;
    seen.add(word);
    const variants = new Set<string>([word, ...(synonymsByWord.get(word) ?? [])]);
    terms.push({ raw: word, variants, soft: SOFT_WORDS.has(word) });
  }
  // A query made only of soft words ("new collection") still has to match something.
  if (terms.length > 0 && terms.every((t) => t.soft)) {
    for (const t of terms) t.soft = false;
  }
  return terms;
}

interface Field {
  words: string[];
  weight: number;
}

function detailValues(details: Record<string, unknown> | undefined): string {
  if (!details || typeof details !== "object") return "";
  return Object.values(details)
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .filter((v): v is string | number => typeof v === "string" || typeof v === "number")
    .join(" ");
}

function fieldsFor(product: SearchableProduct, ctx: SearchContext): Field[] {
  const category = product.categoryId ? ctx.categoriesById.get(String(product.categoryId)) : undefined;
  const parent = category?.parentId ? ctx.categoriesById.get(String(category.parentId)) : undefined;
  const boutiqueName = product.boutiqueId ? ctx.boutiqueNamesById.get(String(product.boutiqueId)) ?? "" : "";
  const tags = Array.isArray(product.tags) ? product.tags.filter((t) => typeof t === "string").join(" ") : "";

  return [
    { words: wordsOf(product.name ?? ""), weight: 10 },
    { words: wordsOf(`${category?.name ?? ""} ${category?.slug ?? ""}`), weight: 8 },
    { words: wordsOf(boutiqueName), weight: 7 },
    { words: wordsOf(tags), weight: 6 },
    { words: wordsOf(`${product.material ?? ""} ${product.materialType ?? ""} ${detailValues(product.details)}`), weight: 5 },
    { words: wordsOf(`${parent?.name ?? ""} ${parent?.slug ?? ""}`), weight: 3 },
    { words: wordsOf(product.description ?? ""), weight: 2 },
    { words: wordsOf(product.story ?? ""), weight: 1 },
  ];
}

/** Best score this term earns anywhere in the product, or 0 when it appears nowhere. */
function scoreTerm(term: QueryTerm, fields: Field[]): number {
  let best = 0;
  for (const field of fields) {
    for (const word of field.words) {
      for (const variant of term.variants) {
        let points = 0;
        if (word === variant) points = field.weight;
        // Prefix match is what makes type-ahead work ("sal" -> salwar). It is limited to the
        // shopper's own word — a synonym prefix like "man" would hit "Mandarin collar" — and to
        // short structured fields, since "men" would otherwise hit "mentioned" in descriptions.
        else if (
          variant === term.raw &&
          variant.length >= 3 &&
          field.weight >= PREFIX_MIN_FIELD_WEIGHT &&
          word.startsWith(variant)
        ) {
          points = field.weight * 0.7;
        }
        if (points === 0) continue;
        // The shopper's own word outranks a synonym, so "kurta" lists kurtas before kurtis.
        if (variant !== term.raw) points *= 0.6;
        if (points > best) best = points;
      }
    }
  }
  return best;
}

/**
 * Ranks products for a query. Products containing every non-soft term come first; if none do,
 * products containing some of them are returned instead, so a shopper sees related items rather
 * than an unrelated fallback.
 */
export function rankProducts<P extends SearchableProduct>(
  query: string,
  products: P[],
  ctx: SearchContext
): ScoredProduct<P>[] {
  const terms = parseQuery(query);
  if (terms.length === 0) return [];
  const requiredCount = terms.filter((t) => !t.soft).length;

  const scored = products.map((product) => {
    const fields = fieldsFor(product, ctx);
    let score = 0;
    let requiredMatched = 0;
    for (const term of terms) {
      const s = scoreTerm(term, fields);
      score += s;
      if (s > 0 && !term.soft) requiredMatched++;
    }
    return { product, score, requiredMatched };
  });

  const sortByRelevance = (a: (typeof scored)[number], b: (typeof scored)[number]) =>
    b.requiredMatched - a.requiredMatched ||
    b.score - a.score ||
    (b.product.createdAt ?? 0) - (a.product.createdAt ?? 0);

  const complete = scored.filter((s) => s.requiredMatched === requiredCount && s.score > 0);
  const pool = complete.length > 0 ? complete : scored.filter((s) => s.requiredMatched > 0);

  return pool.sort(sortByRelevance).map((s) => ({
    product: s.product,
    score: s.score,
    matchedAllTerms: s.requiredMatched === requiredCount,
  }));
}
