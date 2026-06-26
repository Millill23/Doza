import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@doza/db";
import { requireRole } from "@/lib/session";
import { getEditorRefs } from "@/lib/product-editor-data";
import ProductEditor from "@/components/ProductEditor";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole(["admin"]);
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      volumes: { orderBy: { volumeMl: "asc" } },
      photos: { orderBy: { sortOrder: "asc" } },
      similarTo: true,
    },
  });
  if (!product) notFound();

  const { brands, others } = await getEditorRefs(id);

  return (
    <div>
      <Link href="/products" className="mb-4 inline-block text-sm text-ivory-faint hover:text-gold-400">
        ← К товарам
      </Link>
      <h1 className="mb-6 font-serif text-3xl text-ivory">{product.name}</h1>
      <ProductEditor
        brands={brands}
        others={others}
        initial={{
          id: product.id,
          brandId: product.brandId,
          name: product.name,
          gender: product.gender,
          description: product.description ?? "",
          notesTop: product.notesTop ?? "",
          notesMid: product.notesMid ?? "",
          notesBase: product.notesBase ?? "",
          lowStockThreshold:
            product.lowStockThreshold != null ? String(product.lowStockThreshold) : "",
          loyaltyPercentOverride:
            product.loyaltyPercentOverride != null
              ? String(Number(product.loyaltyPercentOverride))
              : "",
          isArchived: product.isArchived,
          volumes: product.volumes.map((v) => ({
            id: v.id,
            volumeMl: v.volumeMl,
            priceByn: Number(v.priceByn),
            isActive: v.isActive,
          })),
          photos: product.photos.map((p) => ({
            id: p.id,
            url: p.url,
            sortOrder: p.sortOrder,
          })),
          similarIds: product.similarTo.map((s) => s.similarId),
        }}
      />
    </div>
  );
}
