import ProductList from "@/components/ProductList";
import type { ProductSearchParams } from "@/components/ProductFilters";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ProductsPage({ searchParams }: { searchParams: ProductSearchParams }) {
  await requireRole(["admin"]);
  return <ProductList searchParams={searchParams} editable />;
}
