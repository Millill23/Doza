import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getEditorRefs } from "@/lib/product-editor-data";
import ProductEditor from "@/components/ProductEditor";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  await requireRole(["admin"]);
  const { brands, others } = await getEditorRefs();

  return (
    <div>
      <Link href="/products" className="mb-4 inline-block text-sm text-ivory-faint hover:text-gold-400">
        ← К товарам
      </Link>
      <h1 className="mb-6 font-serif text-3xl text-ivory">Новый товар</h1>
      <ProductEditor
        brands={brands}
        others={others}
        initial={{
          brandId: brands[0]?.id ?? 0,
          name: "",
          gender: "unisex",
          description: "",
          notesTop: "",
          notesMid: "",
          notesBase: "",
          lowStockThreshold: "",
          loyaltyPercentOverride: "",
          isArchived: false,
          volumes: [
            { volumeMl: 2, priceByn: 0, isActive: true },
            { volumeMl: 5, priceByn: 0, isActive: true },
          ],
          photos: [],
          similarIds: [],
        }}
      />
    </div>
  );
}
