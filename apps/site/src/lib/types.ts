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
  /** минимальная цена среди объёмов */
  priceFrom: number;
  /** эффективный процент кешбэка баллами (override или глобальный) */
  cashbackPercent: number;
  /** true, если кешбэк повышен относительно глобального */
  cashbackBoosted: boolean;
}

export interface ProductDetail extends ProductCard {
  notesTop?: string;
  notesMid?: string;
  notesBase?: string;
  description?: string;
  volumes: ProductVolume[];
  similar: ProductCard[];
}

export const GENDER_LABELS: Record<Gender, string> = {
  male: "Мужской",
  female: "Женский",
  unisex: "Унисекс",
};
