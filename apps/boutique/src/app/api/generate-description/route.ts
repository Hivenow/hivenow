import { NextRequest, NextResponse } from "next/server";

const CRAFT_GLOSSARY: Record<string, string> = {
  kasavu: "Kasavu is a traditional handwoven cream-colored fabric with exquisite gold zari borders, originating from Kerala, India. It represents elegance, tradition, and timeless craftsmanship.",
  chikankari: "Chikankari is a delicate and artful traditional embroidery style from Lucknow, India, characterized by intricate hand-embroidered white threadwork on sheer pastel fabrics.",
  shibori: "Shibori is a traditional Japanese tie-dyeing technique that creates beautiful, organic, and abstract patterns on textile surfaces by folding, twisting, or bunching the cloth.",
  banarasi: "Banarasi silk is a legendary, luxurious handwoven fabric from Varanasi, India, known for its gold and silver brocade or zari, fine silk, and opulent designs.",
  handloom: "Handloom fabrics are meticulously woven by skilled artisans on manual wooden looms. They reflect sustainable craftsmanship, unique textures, and human artistry.",
  chanderi: "Chanderi is a traditional handwoven fabric from Madhya Pradesh, India, known for its lightweight, sheer texture, luxurious feel, and fine zari work.",
  organza: "Organza is a light, crisp, and sheer plain-woven fabric that offers a beautiful structured drape and subtle translucent sheen, perfect for elegant formalwear.",
  kalamkari: "Kalamkari is a traditional hand-painted or block-printed cotton textile art originating from Andhra Pradesh, India, featuring detailed mythological motifs colored with natural organic dyes.",
  bandhani: "Bandhani is a highly skilled traditional Indian tie-dye technique from Gujarat and Rajasthan, characterized by minute, intricate dotted patterns created by plucking and tying the cloth.",
  jamdani: "Jamdani is a legendary hand-woven fine muslin textile technique from Bengal, featuring intricate floral and geometric motifs created directly on the loom."
};

const STYLE_PROMPTS: Record<string, string> = {
  elegant: "Write in a highly sophisticated, premium, and graceful tone. Use words that sound refined and high-end but avoid forbidden buzzwords.",
  minimalist: "Write in a clean, direct, and modern tone. Focus on simple features, geometry, and utility without unnecessary fluff.",
  festive: "Write in a vibrant, celebratory, and warm tone. Focus on grandeur, celebration, and rich traditional styling.",
  casual: "Write in an easy, laid-back, everyday comfortable tone. Focus on daily wearability and relaxed style.",
  artistic: "Write in an expressive, heritage-focused, and storytelling tone. Focus on the craft, dye, and design heritage."
};

function getLocalCraftDetails(text: string): string {
  const lowercaseText = text.toLowerCase();
  const matchedCrafts: string[] = [];
  for (const [key, value] of Object.entries(CRAFT_GLOSSARY)) {
    if (lowercaseText.includes(key)) {
      matchedCrafts.push(value);
    }
  }
  return matchedCrafts.length > 0
    ? `\nCraft Context:\n${matchedCrafts.join("\n")}`
    : "";
}

function generateDynamicFallback(roughText: string, style: string, verticalType: string): string {
  const raw = roughText.trim();
  const capitalized = raw.charAt(0).toUpperCase() + raw.slice(1);
  const lowercase = raw.toLowerCase();

  // The style templates below describe fit, drape and fabric on the skin, which
  // is nonsense for a notebook, a perfume or a watch. Anything that is not a
  // garment gets a neutral line that claims nothing about the product.
  if (verticalType !== "apparel") {
    const neutral = [
      `${capitalized}. Thoughtfully made and easy to use, it makes a lovely pick for yourself or a thoughtful gift.`,
      `${capitalized}. A well-made choice for everyday use, and a simple, thoughtful gift.`,
    ];
    return neutral[Math.floor(Math.random() * neutral.length)]!;
  }

  const templates: Record<string, string[]> = {
    elegant: [
      `${capitalized}. An exceptionally refined design presenting a polished silhouette. Tailored for those who value classic lines and premium comfort, this style carries a sophisticated drape suitable for evening wear and special occasions.`,
      `A graceful presentation of ${lowercase}, featuring clean finishes and a tailored fit. Represents an upscale addition to your collection, delivering structural luxury and comfort in equal measure.`
    ],
    minimalist: [
      `${capitalized}. Designed with clean lines and absolute simplicity. Soft to the touch and fit for easy daily wear, it offers a neat, uncluttered look for modern wardrobes.`,
      `A clean-cut ${lowercase} that keeps details minimal. Focuses on quality fabric, neat seams, and functional daily styling.`
    ],
    festive: [
      `${capitalized}. Crafted for celebratory charm, bringing rich details and traditional textures to light. Perfect for special moments and festive gatherings, it pairs comfort with dynamic design.`,
      `A vibrant display of ${lowercase}, presenting a festive and warm look. Built with lightweight, premium weave to keep you comfortable during long celebrations.`
    ],
    casual: [
      `${capitalized}. Designed for everyday wear, easy comfort, and simple styling. Soft on the skin and fits true to size, making it a reliable choice for work or casual weekends.`,
      `An easygoing ${lowercase} with a relaxed fit. Keeps things simple, lightweight, and comfortable for all-day comfort.`
    ],
    artistic: [
      `${capitalized}. A unique creation celebrating rich textile heritage and organic design patterns. Highlighting historical craftsmanship and hand-done detailing, it represents a wearable piece of art.`,
      `A beautiful canvas of ${lowercase}, showcasing traditional textures and artisanal storytelling.`
    ]
  };

  const selectedTemplates = templates[style] || templates.casual!;
  const index = Math.floor(Math.random() * selectedTemplates.length);
  return selectedTemplates[index]!;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to stream text string chunk-by-chunk to simulate real streaming response
function createFallbackStream(text: string): ReadableStream {
  const encoder = new TextEncoder();
  const words = text.split(" ");
  let wordIndex = 0;

  return new ReadableStream({
    async pull(controller) {
      if (wordIndex < words.length) {
        const chunk = words[wordIndex] + (wordIndex === words.length - 1 ? "" : " ");
        controller.enqueue(encoder.encode(chunk));
        wordIndex++;
        await sleep(30); // 30ms typing feel
      } else {
        controller.close();
      }
    }
  });
}

export async function POST(req: NextRequest) {
  try {
    const { roughText, type, style = "casual", verticalType = "apparel", categoryName } = await req.json();

    if (!roughText || !roughText.trim()) {
      return NextResponse.json({ error: "Rough text input is required" }, { status: 400 });
    }

    // 1. Gather API keys for failover
    const keysString = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
    const apiKeys = keysString.split(",").map(k => k.trim()).filter(Boolean);

    // 2. Gather context
    const craftContext = getLocalCraftDetails(roughText);
    const styleInstruction = STYLE_PROMPTS[style] || STYLE_PROMPTS.casual!;

    // 3. Assemble Prompt
    const roleMap: Record<string, string> = {
      fragrance: "You are a product copywriter for a boutique fragrance brand. Rewrite the notes into a clear, evocative description focusing on scent profile, notes, and occasion wear.",
      handbag: "You are a product copywriter for a designer handbag boutique. Rewrite the notes into a clean description focusing on silhouette, capacity, styling, and leather/fabric quality.",
      apparel: "You are a product copywriter for a clothing store. Rewrite the user's rough notes into a clear, simple, and natural product description.",
      jewellery: "You are a product copywriter for a jewellery store. Rewrite the notes into a clear description focusing on the design, metal or finish, stones, and the occasions it suits.",
      footwear: "You are a product copywriter for a footwear store. Rewrite the notes into a clear description focusing on the style, material, comfort, and where it is best worn.",
      lifestyle: "You are a product copywriter for a lifestyle, home and stationery store. Rewrite the notes into a clear description focusing on what the product is, what is included, its size and materials, and how it is used or gifted.",
    };
    const rolePrompt = roleMap[verticalType] || roleMap.apparel!;

    // The category narrows the vertical: "lifestyle" covers both notebooks and
    // bedsheets. It is admin-defined, but it still goes into a prompt, so it is
    // flattened to one short line.
    const safeCategory =
      typeof categoryName === "string"
        ? categoryName.replace(/[\r\n"`]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60)
        : "";
    const categoryLine = safeCategory ? `\n    Product category: ${safeCategory}.` : "";

    // What "keep the details accurate" means depends on what is being sold.
    const accuracyDetails =
      verticalType === "apparel"
        ? "color, fabric, comfort, pattern"
        : "quantities, sizes, materials, colours, and specifications";

    const systemPrompt = `${rolePrompt}${categoryLine}
    
    STYLE DIRECTION:
    ${styleInstruction}

    STRICT WRITING RULES:
    - Write in simple, warm, everyday English.
    - Keep the language clean and friendly.
    - NEVER use AI buzzwords or dramatic cliché phrases such as "exquisite", "lustrous", "timeless elegance", "meticulously crafted", "effortlessly", "sophisticated", "draped in", "testament to", "rich crimson", or "uniquely textured".
    - Keep all original details (${accuracyDetails}) 100% accurate. Do not invent extra features.
    - Write a maximum of 180 characters in one complete, natural paragraph (1 to 2 concise sentences).
    - Focus ONLY on the product itself. Do not mention any store, boutique, merchant, or delivery service.

    Return ONLY the plain text without intro, outro, or wrapper quotes.

    ${craftContext}

    Rough Input:
    "${roughText.trim()}"

    Polished Output:`;

    // 4. Try API Keys and active Gemini models in failover
    const candidateModels = ["gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-2.0-flash"];

    if (apiKeys.length > 0) {
      for (let i = 0; i < apiKeys.length; i++) {
        const apiKey = apiKeys[i];

        for (const modelId of candidateModels) {
          try {
            console.log(`[Hive AI] Attempting key ${i} model ${modelId}...`);
            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [
                    {
                      parts: [
                        {
                          text: systemPrompt
                        }
                      ]
                    }
                  ]
                })
              }
            );

            if (response.ok) {
              const data = await response.json();
              const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
              if (text) {
                console.log(`[Hive AI SUCCESS ✨] Generated description from ${modelId}!`);
                
                // Return streaming response for real-time typing feel
                return new Response(createFallbackStream(text), {
                  headers: {
                    "Content-Type": "text/plain; charset=utf-8",
                    "Transfer-Encoding": "chunked",
                  },
                });
              }
            }
          } catch (err) {
            console.warn(`[Hive AI failover warning] Model ${modelId} failed:`, err);
          }
        }
      }
    }

    // 5. Fallback stream if API keys fail
    console.log("[Hive AI Stream Fallback 🔄] Streaming dynamic rule template...");
    const fallbackText = generateDynamicFallback(roughText, style, verticalType);
    return new Response(createFallbackStream(fallbackText), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });

  } catch (error: any) {
    console.error("[Hive AI Stream API Error]:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
