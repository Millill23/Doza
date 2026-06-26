"use server";

import { prisma } from "@doza/db";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";

export async function setBirthday(customerId: number, date: string) {
  await requireRole(["admin", "seller", "marketer"]);
  await prisma.customer.update({
    where: { id: customerId },
    data: { birthday: date ? new Date(date) : null },
  });
  revalidatePath(`/customers/${customerId}`);
}

export async function addCustomerDate(
  customerId: number,
  date: string,
  description: string,
) {
  await requireRole(["admin", "seller", "marketer"]);
  if (!date || !description.trim()) return;

  const count = await prisma.customerDate.count({ where: { customerId } });
  if (count >= 3) throw new Error("Не более 3 памятных дат");

  await prisma.customerDate.create({
    data: { customerId, date: new Date(date), description: description.trim() },
  });
  revalidatePath(`/customers/${customerId}`);
}

export async function removeCustomerDate(id: number, customerId: number) {
  await requireRole(["admin", "seller", "marketer"]);
  await prisma.customerDate.delete({ where: { id } });
  revalidatePath(`/customers/${customerId}`);
}
