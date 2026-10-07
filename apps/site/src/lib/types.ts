export type Gender = "male" | "female" | "unisex";

export interface ProductVolume {
  volumeMl: number;
  priceByn: number;
}

export interface ProductCard {
  id: number;
  slug: string;
  brand: string;
  name: string;
  gender: Gender;
  image: string;
  /** минимальная цена среди объёмов (до скидки) */
  priceFrom: number;
  /** активная скидка на цену, % (0 если нет) */
  discountPercent: number;
  /** эффективный процент кешбэка баллами (override или глобальный) */
  cashbackPercent: number;
  /** true, если кешбэк повышен относительно глобального */
  cashbackBoosted: boolean;
  /** Остаток ушёл ниже порога – аромат снят с продажи. */
  soldOut: boolean;
}

export interface ProductDetail extends ProductCard {
  notesTop?: string;
  notesMid?: string;
  notesBase?: string;
  description?: string;
  volumes: ProductVolume[];
  similar: ProductCard[];
}

export interface FinderProduct extends ProductCard {
  notes: string;
  notesTop?: string;
  notesMid?: string;
  notesBase?: string;
  description?: string;
  similarIds: number[];
}

export const GENDER_LABELS: Record<Gender, string> = {
  male: "Мужской",
  female: "Женский",
  unisex: "Унисекс",
};
