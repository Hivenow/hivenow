import { ConvexHttpClient } from "convex/browser";
import fs from "fs";
import * as dotenv from "dotenv";
import mammoth from "mammoth";
import { anyApi } from "convex/server";

dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
if (!url) {
  console.error("No CONVEX_URL found in .env.local");
  process.exit(1);
}
const client = new ConvexHttpClient(url);

async function processDoc(filename, slug) {
  console.log(`Processing ${filename}...`);
  let content = "";
  if (filename.endsWith('.md')) {
    content = fs.readFileSync(filename, 'utf-8');
  } else {
    const result = await mammoth.convertToMarkdown({ path: filename });
    content = result.value;
  }
  
  console.log(`Seeding ${slug}... (${content.length} characters)`);
  
  await client.mutation("legal:seedLegalDocuments", { slug, content });
  
  console.log(`Done with ${slug}.`);
}

async function run() {
  await processDoc("Hive_Boutique_Partner_Agreement.docx", "partner-agreement");
  await processDoc("Hive_Privacy_Policy.md", "privacy-policy");
  await processDoc("Hive_Return_and_Refund_Policy.md", "return-policy");
  await processDoc("Hive_Terms_and_Conditions.md", "terms-and-conditions");
}
run();
