"use client";

import { useState, useTransition } from "react";
import {
  createUser,
  toggleUserActive,
  resetUserPassword,
} from "@/lib/actions/users";

interface UserRow {
  id: number;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Администратор",
  seller: "Продавец",
  marketer: "Маркетолог",
};

export default function UsersManager({ users }: { users: UserRow[] }) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [resetId, setResetId] = useState<number | null>(null);
  const [newPass, setNewPass] = useState("");

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* Список */}
      <div className="overflow-hidden rounded-xl border border-ink-600/60">
        <table className="w-full text-sm">
          <thead className="bg-ink-800 text-left text-xs uppercase tracking-wide text-ivory-faint">
            <tr>
              <th className="px-4 py-3">Имя / Email</th>
              <th className="px-4 py-3">Роль</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-ink-600/40 bg-ink-700">
                <td className="px-4 py-3">
                  <div className="text-ivory">{u.name}</div>
                  <div className="text-xs text-ivory-faint">{u.email}</div>
                </td>
                <td className="px-4 py-3 text-ivory-muted">{ROLE_LABEL[u.role]}</td>
                <td className="px-4 py-3">
                  <span className={u.isActive ? "text-botanical-300" : "text-red-300"}>
                    {u.isActive ? "Активен" : "Отключён"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => startTransition(() => toggleUserActive(u.id))}
                      className="rounded border border-ink-600 px-2 py-1 text-xs text-ivory-muted hover:border-gold-600/60"
                    >
                      {u.isActive ? "Отключить" : "Включить"}
                    </button>
                    <button
                      onClick={() => setResetId(resetId === u.id ? null : u.id)}
                      className="rounded border border-ink-600 px-2 py-1 text-xs text-ivory-muted hover:border-gold-600/60"
                    >
                      Пароль
                    </button>
                  </div>
                  {resetId === u.id && (
                    <div className="mt-2 flex gap-1">
                      <input
                        type="text" value={newPass}
                        onChange={(e) => setNewPass(e.target.value)}
                        placeholder="Новый пароль"
                        className="h-8 w-32 rounded border border-ink-600 bg-ink-800 px-2 text-xs text-ivory focus:border-gold-500 focus:outline-none"
                      />
                      <button
                        onClick={() => {
                          setErr(null);
                          startTransition(async () => {
                            try {
                              await resetUserPassword(u.id, newPass);
                              setResetId(null);
                              setNewPass("");
                            } catch (e) {
                              setErr((e as Error).message);
                            }
                          });
                        }}
                        className="rounded bg-gold-gradient px-2 text-xs font-medium text-ink-900"
                      >
                        OK
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Создание */}
      <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
        <h2 className="mb-4 font-serif text-xl text-ivory">Новый пользователь</h2>
        <form
          action={(fd) => {
            setErr(null);
            startTransition(async () => {
              try {
                await createUser(fd);
              } catch (e) {
                setErr((e as Error).message);
              }
            });
          }}
          className="space-y-3"
        >
          <input name="name" placeholder="Имя" required
            className="h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none" />
          <input name="email" type="email" placeholder="Email" required
            className="h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none" />
          <select name="role" required
            className="h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none">
            <option value="admin">Администратор</option>
            <option value="seller">Продавец</option>
            <option value="marketer">Маркетолог</option>
          </select>
          <input name="password" type="text" placeholder="Пароль" required
            className="h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none" />
          <button type="submit" disabled={pending}
            className="w-full rounded-full bg-gold-gradient py-2.5 text-sm font-medium text-ink-900 disabled:opacity-50">
            Создать
          </button>
          {err && <p className="text-sm text-red-300">{err}</p>}
        </form>
      </div>
    </div>
  );
}
