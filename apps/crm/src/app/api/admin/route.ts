import { handler, ok } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Оглавление апишки.
 *
 * Чтобы не приходилось читать исходники, вспоминая, что тут вообще есть.
 * Список руками, а не автоматический: описание своими словами полезнее, чем
 * перечень путей.
 */
const ENDPOINTS = [
  { method: "GET", path: "/api/admin", about: "это оглавление" },
  {
    method: "GET",
    path: "/api/admin/health",
    about: "задеплоенный коммит, миграции, какие переменные заданы, остатки",
  },

  {
    method: "GET",
    path: "/api/admin/products?q=&brandId=&archived=0|1|all&soldOut=1&limit=",
    about: "список товаров",
  },
  { method: "POST", path: "/api/admin/products", about: "создать товар (есть dry_run)" },
  { method: "GET", path: "/api/admin/products/:id", about: "карточка целиком" },
  {
    method: "PATCH",
    path: "/api/admin/products/:id",
    about:
      "правка: присылать только меняемые поля. volumes, photos и similarIds " +
      "синхронизируются целиком – что не прислано, то удаляется",
  },
  { method: "DELETE", path: "/api/admin/products/:id", about: "снять с витрины (не удаляет)" },

  { method: "GET", path: "/api/admin/products/:id/photos", about: "фото товара" },
  {
    method: "POST",
    path: "/api/admin/products/:id/photos",
    about: "добавить фото: JSON {url} или multipart с полем file. Сожмётся в WebP",
  },
  {
    method: "PATCH",
    path: "/api/admin/products/:id/photos/:photoId",
    about: "порядок: {sortOrder}. Меньший – ближе к обложке",
  },
  { method: "DELETE", path: "/api/admin/products/:id/photos/:photoId", about: "убрать фото" },

  { method: "GET", path: "/api/admin/brands", about: "бренды с числом товаров" },
  { method: "POST", path: "/api/admin/brands", about: "завести бренд: {name}" },

  { method: "GET", path: "/api/admin/inventory?problem=1", about: "остатки по каталогу" },
  {
    method: "PUT",
    path: "/api/admin/inventory/:productId",
    about: "выставить остаток: {quantityMl}. Абсолютное значение, не прибавка",
  },

  { method: "GET", path: "/api/admin/promos?active=1", about: "акции" },
  {
    method: "POST",
    path: "/api/admin/promos",
    about: "{productId|null, discountPercent, cashbackPercent, startsAt, endsAt}",
  },
  { method: "DELETE", path: "/api/admin/promos", about: "{id}" },

  { method: "GET", path: "/api/admin/settings", about: "белый список настроек" },
  { method: "PUT", path: "/api/admin/settings", about: "{ключ: значение}" },

  { method: "GET", path: "/api/admin/offices?q=&noCoords=1", about: "отделения Европочты" },
  { method: "PATCH", path: "/api/admin/offices", about: "{code, lat, lng, isActive}" },

  {
    method: "GET",
    path: "/api/admin/analytics/products?from=&to=&limit=",
    about: "лидеры и аутсайдеры по мл и выручке. Только агрегаты по товарам",
  },
];

export const GET = handler(async () => {
  return ok({
    about:
      "Техническая апишка DOZA: каталог, остатки, акции, настройки. " +
      "Клиентов, заказов и денег здесь нет намеренно.",
    auth: "Authorization: Bearer <ADMIN_API_TOKEN>",
    notes: [
      "Все ответы: {ok: true, ...} либо {ok: false, error}.",
      "Изменения пишутся в журнал admin_api_log – видно, что и когда меняла апишка.",
      "dry_run: true на создании и правке товара считает результат, ничего не записывая.",
      "Цены и остатки – числа, не строки.",
    ],
    endpoints: ENDPOINTS,
  });
});
