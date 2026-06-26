export const ORDER_STATUS_LABEL: Record<string, string> = {
  new: "Новый",
  confirmed: "Подтверждён",
  shipped: "Отправлен",
  closed: "Закрыт",
  rejected: "Не подтверждён",
  returned: "Возврат",
};

export const ORDER_STATUS_STYLE: Record<string, string> = {
  new: "border-gold-500/40 bg-gold-500/10 text-gold-300",
  confirmed: "border-botanical-500/40 bg-botanical-700/20 text-botanical-300",
  shipped: "border-blue-500/40 bg-blue-500/10 text-blue-300",
  closed: "border-green-500/40 bg-green-500/10 text-green-300",
  rejected: "border-red-500/40 bg-red-500/10 text-red-300",
  returned: "border-orange-500/40 bg-orange-500/10 text-orange-300",
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
