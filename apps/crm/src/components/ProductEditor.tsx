"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveProduct, type ProductPayload } from "@/lib/actions/product-edit";

interface Brand {
  id: number;
  name: string;
}
interface OtherProduct {
  id: number;
  name: string;
  brand: string;
}
interface InitialData {
  id?: number;
  brandId: number;
  name: string;
  gender: "male" | "female" | "unisex";
  description: string;
  notesTop: string;
  notesMid: string;
  notesBase: string;
  lowStockThreshold: string;
  loyaltyPercentOverride: string;
  isArchived: boolean;
  volumes: { id?: number; volumeMl: number; priceByn: number; isActive: boolean }[];
  photos: { id?: number; url: string; sortOrder: number }[];
  similarIds: number[];
}

const inputCls =
  "h-10 w-full rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ivory focus:border-gold-500 focus:outline-none";
const labelCls = "mb-1.5 block text-xs uppercase tracking-wide text-gold-500";

export default function ProductEditor({
  brands,
  others,
  initial,
}: {
  brands: Brand[];
  others: OtherProduct[];
  initial: InitialData;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [brandId, setBrandId] = useState(initial.brandId || brands[0]?.id || 0);
  const [name, setName] = useState(initial.name);
  const [gender, setGender] = useState(initial.gender);
  const [description, setDescription] = useState(initial.description);
  const [notesTop, setNotesTop] = useState(initial.notesTop);
  const [notesMid, setNotesMid] = useState(initial.notesMid);
  const [notesBase, setNotesBase] = useState(initial.notesBase);
  const [threshold, setThreshold] = useState(initial.lowStockThreshold);
  const [loyaltyOverride, setLoyaltyOverride] = useState(initial.loyaltyPercentOverride);
  const [isArchived, setIsArchived] = useState(initial.isArchived);
  const [volumes, setVolumes] = useState(initial.volumes);
  const [photos, setPhotos] = useState(initial.photos);
  const [similarIds, setSimilarIds] = useState<number[]>(initial.similarIds);

  function addVolume() {
    setVolumes([...volumes, { volumeMl: 0, priceByn: 0, isActive: true }]);
  }
  function updateVolume(idx: number, patch: Partial<(typeof volumes)[number]>) {
    setVolumes(volumes.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  }
  function removeVolume(idx: number) {
    setVolumes(volumes.filter((_, i) => i !== idx));
  }

  function addPhoto() {
    setPhotos([...photos, { url: "", sortOrder: photos.length }]);
  }
  function updatePhoto(idx: number, url: string) {
    setPhotos(photos.map((p, i) => (i === idx ? { ...p, url } : p)));
  }
  function removePhoto(idx: number) {
    setPhotos(photos.filter((_, i) => i !== idx).map((p, i) => ({ ...p, sortOrder: i })));
  }

  function toggleSimilar(id: number) {
    setSimilarIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const [uploading, setUploading] = useState(false);
  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setErr(null);
    setUploading(true);
    try {
      const uploaded: typeof photos = [];
      let order = photos.length;
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const r = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await r.json();
        if (!r.ok || !data.ok) throw new Error(data.error || "Ошибка загрузки");
        uploaded.push({ url: data.url, sortOrder: order++ });
      }
      setPhotos((prev) => [...prev, ...uploaded]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function save() {
    setErr(null);
    const payload: ProductPayload = {
      id: initial.id,
      brandId: Number(brandId),
      name,
      gender,
      description,
      notesTop,
      notesMid,
      notesBase,
      lowStockThreshold: threshold ? Number(threshold) : null,
      loyaltyPercentOverride: loyaltyOverride ? Number(loyaltyOverride) : null,
      isArchived,
      volumes: volumes.map((v) => ({
        id: v.id,
        volumeMl: Number(v.volumeMl),
        priceByn: Number(v.priceByn),
        isActive: v.isActive,
      })),
      photos: photos
        .filter((p) => p.url.trim())
        .map((p, i) => ({ id: p.id, url: p.url, sortOrder: i })),
      similarIds,
    };
    startTransition(async () => {
      try {
        const id = await saveProduct(payload);
        router.push(`/products/${id}/edit`);
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* Левая колонка — основное */}
      <div className="space-y-6">
        <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
          <h2 className="mb-4 font-serif text-xl text-ivory">Основное</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Бренд</label>
              <select value={brandId} onChange={(e) => setBrandId(Number(e.target.value))} className={inputCls}>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Гендер</label>
              <select value={gender} onChange={(e) => setGender(e.target.value as typeof gender)} className={inputCls}>
                <option value="male">Мужской</option>
                <option value="female">Женский</option>
                <option value="unisex">Унисекс</option>
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className={labelCls}>Название</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div className="mt-4">
            <label className={labelCls}>Описание</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-ivory focus:border-gold-500 focus:outline-none" />
          </div>
        </div>

        {/* Ноты */}
        <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
          <h2 className="mb-4 font-serif text-xl text-ivory">Пирамида аромата</h2>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Верхние ноты</label>
              <input value={notesTop} onChange={(e) => setNotesTop(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Средние ноты</label>
              <input value={notesMid} onChange={(e) => setNotesMid(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Базовые ноты</label>
              <input value={notesBase} onChange={(e) => setNotesBase(e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>

        {/* Объёмы */}
        <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif text-xl text-ivory">Объёмы и цены</h2>
            <button onClick={addVolume} className="rounded-lg border border-gold-600/50 px-3 py-1.5 text-xs text-gold-400 hover:border-gold-500">
              + Объём
            </button>
          </div>
          <div className="space-y-2">
            {volumes.length === 0 && <p className="text-sm text-ivory-faint">Добавьте хотя бы один объём.</p>}
            {volumes.map((v, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input type="number" min={0} value={v.volumeMl} onChange={(e) => updateVolume(idx, { volumeMl: Number(e.target.value) })}
                  placeholder="мл" className="h-9 w-24 rounded-lg border border-ink-600 bg-ink-800 px-2 text-sm text-ivory focus:border-gold-500 focus:outline-none" />
                <span className="text-xs text-ivory-faint">мл</span>
                <input type="number" min={0} step="0.01" value={v.priceByn} onChange={(e) => updateVolume(idx, { priceByn: Number(e.target.value) })}
                  placeholder="цена" className="h-9 w-28 rounded-lg border border-ink-600 bg-ink-800 px-2 text-sm text-ivory focus:border-gold-500 focus:outline-none" />
                <span className="text-xs text-ivory-faint">BYN</span>
                <label className="flex items-center gap-1.5 text-xs text-ivory-muted">
                  <input type="checkbox" checked={v.isActive} onChange={(e) => updateVolume(idx, { isActive: e.target.checked })} className="h-4 w-4 accent-gold-500" />
                  активен
                </label>
                <button onClick={() => removeVolume(idx)} className="ml-auto text-ivory-faint hover:text-red-300">✕</button>
              </div>
            ))}
          </div>
        </div>

        {/* Фото */}
        <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif text-xl text-ivory">Фото</h2>
            <div className="flex items-center gap-2">
              <label className="cursor-pointer rounded-lg border border-gold-600/50 px-3 py-1.5 text-xs text-gold-400 hover:border-gold-500">
                {uploading ? "Загрузка…" : "↑ Загрузить файл"}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => handleUpload(e.target.files)}
                />
              </label>
              <button onClick={addPhoto} className="rounded-lg border border-ink-600 px-3 py-1.5 text-xs text-ivory-muted hover:border-gold-600/60">
                + URL
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {photos.map((p, idx) => (
              <div key={idx} className="flex items-center gap-2">
                {p.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt="" className="h-12 w-10 rounded object-cover" />
                )}
                <input value={p.url} onChange={(e) => updatePhoto(idx, e.target.value)} placeholder="https://…"
                  className="h-9 flex-1 rounded-lg border border-ink-600 bg-ink-800 px-2 text-sm text-ivory focus:border-gold-500 focus:outline-none" />
                <button onClick={() => removePhoto(idx)} className="text-ivory-faint hover:text-red-300">✕</button>
              </div>
            ))}
            {photos.length === 0 && <p className="text-sm text-ivory-faint">Вставьте ссылку на изображение флакона.</p>}
          </div>
        </div>
      </div>

      {/* Правая колонка — настройки + сохранение */}
      <div className="space-y-6 lg:sticky lg:top-8 lg:self-start">
        <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
          <h2 className="mb-4 font-serif text-xl text-ivory">Параметры</h2>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Порог остатка (мл)</label>
              <input type="number" min={0} value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="по умолчанию" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>% баллов (переопределение)</label>
              <input type="number" min={0} step="0.1" value={loyaltyOverride} onChange={(e) => setLoyaltyOverride(e.target.value)} placeholder="глобальный" className={inputCls} />
            </div>
            <label className="flex items-center gap-2 text-sm text-ivory">
              <input type="checkbox" checked={isArchived} onChange={(e) => setIsArchived(e.target.checked)} className="h-4 w-4 accent-gold-500" />
              В архиве (скрыт на сайте)
            </label>
          </div>
        </div>

        {/* Похожие */}
        <div className="rounded-2xl border border-ink-600/60 bg-ink-700 p-6">
          <h2 className="mb-3 font-serif text-xl text-ivory">Похожие ароматы</h2>
          <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {others.map((o) => (
              <label key={o.id} className="flex cursor-pointer items-center gap-2 text-sm text-ivory-muted hover:text-ivory">
                <input type="checkbox" checked={similarIds.includes(o.id)} onChange={() => toggleSimilar(o.id)} className="h-4 w-4 accent-gold-500" />
                <span className="text-xs text-ivory-faint">{o.brand}</span> {o.name}
              </label>
            ))}
          </div>
        </div>

        {err && <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-2.5 text-sm text-red-300">{err}</p>}

        <button onClick={save} disabled={pending}
          className="h-12 w-full rounded-full bg-gold-gradient text-base font-medium text-ink-900 transition-opacity hover:opacity-90 disabled:opacity-50">
          {pending ? "Сохраняем…" : "Сохранить товар"}
        </button>
      </div>
    </div>
  );
}
