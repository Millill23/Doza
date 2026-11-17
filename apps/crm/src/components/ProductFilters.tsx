import Link from "next/link";
import { GENDER_LABEL } from "@/lib/labels";

export type ProductSearchParams = Record<string, string | string[] | undefined>;

const fieldClass = "h-10 rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500";

export default function ProductFilters({
  query,
  gender,
  sort,
  editable,
}: {
  query: string;
  gender?: string;
  sort?: string;
  editable: boolean;
}) {
  const path = editable ? "/products" : "/stock";

  return (
    <form action={path} method="get" className="mb-4 flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-ivory-muted">
        Поиск товара
        <input type="search" name="q" defaultValue={query} placeholder="Название или бренд" className={fieldClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ivory-muted">
        Пол
        <select name="gender" defaultValue={gender ?? ""} className={fieldClass}>
          <option value="">Все</option>
          {Object.entries(GENDER_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      {editable && (
        <label className="flex flex-col gap-1 text-xs text-ivory-muted">
          Сортировка
          <select name="stock" defaultValue={sort ?? ""} className={fieldClass}>
            <option value="">По бренду и названию</option>
            <option value="asc">Остаток по возрастанию</option>
            <option value="desc">Остаток по убыванию</option>
          </select>
        </label>
      )}
      <button type="submit" className="h-10 rounded-lg border border-gold-600/50 px-4 text-sm text-gold-400 hover:border-gold-500">
        Применить
      </button>
      {(query || gender || sort) && (
        <Link href={path} className="px-2 py-2.5 text-sm text-ivory-muted hover:text-ivory">Сбросить</Link>
      )}
    </form>
  );
}
