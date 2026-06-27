import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type Role = "admin" | "seller" | "marketer";

// Какие роли имеют доступ к префиксу пути
const ACCESS: { prefix: string; roles: Role[] }[] = [
  { prefix: "/products", roles: ["admin"] },
  { prefix: "/settings", roles: ["admin"] },
  { prefix: "/users", roles: ["admin"] },
  { prefix: "/cash", roles: ["admin", "seller"] },
  { prefix: "/orders", roles: ["admin", "seller"] },
  { prefix: "/customers", roles: ["admin", "seller", "marketer"] },
  { prefix: "/loyalty", roles: ["admin", "marketer"] },
  { prefix: "/analytics", roles: ["admin", "marketer"] },
];

// За nginx (TLS терминируется прокси) запрос до приложения приходит по HTTP,
// поэтому автодетект secure-куки в withAuth ломается. Читаем токен явно с
// secureCookie:true — кука называется "__Secure-next-auth.session-token".
const useSecure = (process.env.NEXTAUTH_URL ?? "").startsWith("https://");

export async function middleware(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: useSecure,
  });

  const path = req.nextUrl.pathname;

  // Не авторизован → на логин
  if (!token) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = `?callbackUrl=${encodeURIComponent(path)}`;
    return NextResponse.redirect(loginUrl);
  }

  // Проверка роли для защищённого префикса
  const role = token.role as Role | undefined;
  const rule = ACCESS.find((r) => path.startsWith(r.prefix));
  if (rule && role && !rule.roles.includes(role)) {
    const home = req.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
  }

  return NextResponse.next();
}

export const config = {
  // защищаем всё, кроме статики, api/auth, загрузок и страницы логина
  matcher: ["/((?!api/auth|uploads|login|_next/static|_next/image|favicon.ico|logo.png).*)"],
};
