import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

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

export default withAuth(
  function middleware(req) {
    const role = req.nextauth.token?.role as Role | undefined;
    const path = req.nextUrl.pathname;

    const rule = ACCESS.find((r) => path.startsWith(r.prefix));
    if (rule && role && !rule.roles.includes(role)) {
      // нет доступа — на дашборд
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  },
  {
    callbacks: { authorized: ({ token }) => !!token },
    pages: { signIn: "/login" },
  },
);

export const config = {
  // защищаем всё, кроме статики, api/auth, загрузок и страницы логина
  matcher: ["/((?!api/auth|uploads|login|_next/static|_next/image|favicon.ico|logo.png).*)"],
};
