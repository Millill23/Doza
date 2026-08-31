"use server";

import { prisma } from "@doza/db";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { hashPassword } from "@/lib/password";

type Role = "admin" | "seller" | "marketer" | "influencer";
// Блогер входит в список: создать его может только админ, а `requireRole`
// выше это и обеспечивает. Отдельного ограничения не нужно — пользователей
// вообще заводит только админ.
const ROLES: Role[] = ["admin", "seller", "marketer", "influencer"];

export async function createUser(formData: FormData) {
  await requireRole(["admin"]);
  const email = String(formData.get("email") || "").toLowerCase().trim();
  const name = String(formData.get("name") || "").trim();
  const role = String(formData.get("role") || "") as Role;
  const password = String(formData.get("password") || "");

  if (!email || !name || !password) throw new Error("Заполните все поля");
  if (!ROLES.includes(role)) throw new Error("Некорректная роль");

  const exists = await prisma.crmUser.findUnique({ where: { email } });
  if (exists) throw new Error("Пользователь с таким email уже существует");

  await prisma.crmUser.create({
    data: { email, name, role, passwordHash: await hashPassword(password) },
  });
  revalidatePath("/users");
}

export async function toggleUserActive(id: number) {
  await requireRole(["admin"]);
  const u = await prisma.crmUser.findUnique({ where: { id } });
  if (!u) return;
  await prisma.crmUser.update({
    where: { id },
    data: { isActive: !u.isActive },
  });
  revalidatePath("/users");
}

export async function resetUserPassword(id: number, password: string) {
  await requireRole(["admin"]);
  if (password.length < 6) throw new Error("Пароль слишком короткий");
  await prisma.crmUser.update({
    where: { id },
    data: { passwordHash: await hashPassword(password) },
  });
  revalidatePath("/users");
}
