export function formatByn(amount: number | string): string {
  return `${Number(amount).toFixed(2)} BYN`;
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("375")) {
    return `+375 (${digits.slice(3, 5)}) ${digits.slice(5, 8)}-${digits.slice(8, 10)}-${digits.slice(10)}`;
  }
  return phone;
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export const ORDER_STATUSES = {
  new: "Новый",
  confirmed: "Подтверждён",
  shipped: "Отправлен",
  closed: "Закрыт",
  rejected: "Не подтверждён",
  returned: "Возврат",
} as const;

export const DELIVERY_TYPES = {
  pickup: "Самовывоз",
  post: "Доставка почтой",
} as const;

export const GENDER_LABELS = {
  male: "Мужской",
  female: "Женский",
  unisex: "Унисекс",
} as const;
