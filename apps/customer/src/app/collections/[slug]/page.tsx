import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function CollectionPage({ params }: Props) {
  const { slug } = await params;
  if (slug) {
    redirect(`/products/${encodeURIComponent(slug)}`);
  }
  redirect("/products");
}
