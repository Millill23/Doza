// Подписи статусов живут рядом с правилами переходов: разъехавшись, они врут
// продавцу о том, что происходит с заказом.
export { ORDER_STATUS_LABEL, DELIVERY_SERVICE_LABEL } from "@doza/db/order-rules";

export const ORDER_STATUS_STYLE: Record<string, string> = {
  new: "border-gold-500/40 bg-gold-500/10 text-gold-300",
  confirmed: "border-botanical-500/40 bg-botanical-700/20 text-botanical-300",
  decanted: "border-purple-500/40 bg-purple-500/10 text-purple-300",
  packed: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  shipped: "border-blue-500/40 bg-blue-500/10 text-blue-300",
  refunded: "border-red-500/40 bg-red-500/10 text-red-300",
  closed: "border-green-500/40 bg-green-500/10 text-green-300",
  rejected: "border-red-500/40 bg-red-500/10 text-red-300",
  returned: "border-orange-500/40 bg-orange-500/10 text-orange-300",
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Ожидает оплаты",
  paid: "Оплачен",
  failed: "Оплата не прошла",
  expired: "Срок оплаты истёк",
  refunded: "Деньги возвращены",
};

export const GENDER_LABEL: Record<string, string> = {
  male: "Мужской",
  female: "Женский",
  unisex: "Унисекс",
};

export const DELIVERY_LABEL: Record<string, string> = {
  pickup: "Самовывоз",
  post: "Доставка почтой",
};
