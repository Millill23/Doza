import { formatByn } from "@doza/shared";
import {
  commissionProgress,
  COMMISSION_TIERS,
} from "@doza/db/commission-rules";

/**
 * Полоска премии продавца.
 *
 * Заполняется от ступени к ступени, а не от нуля до последней: иначе первые
 * восемь тысяч выглядят как две трети пути, хотя за них не платят вовсе, а
 * рывок с десяти до двенадцати тысяч почти не двигает полоску.
 *
 * Серверный компонент: считать тут нечего, всё готовит `commissionProgress`.
 */

/** Круглые тысячи без копеек: «8 000», а не «8000.00 BYN». */
function short(n: number): string {
  return n.toLocaleString("ru-RU");
}

export default function CommissionBar({
  sum,
  compact = false,
}: {
  sum: number;
  /** Узкий вид для списка продавцов: без пояснений, только полоска. */
  compact?: boolean;
}) {
  const p = commissionProgress(sum);
  const done = p.nextPercent === null;

  return (
    <div className={compact ? "" : "mt-5"}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
        <span className="text-ivory-faint">
          {p.percent > 0 ? (
            <>
              Сейчас <span className="text-botanical-300">{p.percent}%</span>
              {p.amount > 0 && (
                <> · премия {formatByn(p.amount)}</>
              )}
            </>
          ) : (
            <>Премия начинается с {short(COMMISSION_TIERS[0].from)} BYN</>
          )}
        </span>
        <span className={done ? "text-gold-400" : "text-ivory-muted"}>
          {done
            ? "максимум взят"
            : `до ${p.nextPercent}% · ещё ${formatByn(p.left)}`}
        </span>
      </div>

      {/* Сама полоска. Зелёная — цвет «выполнено», тот же, что у подтверждений
          по всей CRM; на золотом фоне карточки она читается как результат, а
          не как украшение. */}
      <div
        className="h-3 w-full overflow-hidden rounded-full border border-ink-600 bg-ink-900"
        role="progressbar"
        aria-valuemin={p.segmentFrom}
        aria-valuemax={p.segmentTo}
        aria-valuenow={Math.round(sum)}
        aria-label="Прогресс до следующей ступени премии"
      >
        {/* Оттенки берём из палитры проекта: botanical-600 и -400 в ней нет, и
            классы с ними просто не применялись — полоска выглядела пустой. */}
        <div
          className="h-full rounded-full bg-gradient-to-r from-botanical-500 to-botanical-300 shadow-[0_0_10px_rgba(143,166,122,0.45)] transition-[width] duration-500"
          style={{ width: `${Math.round(p.fill * 100)}%` }}
        />
      </div>

      {!compact && (
        <div className="mt-1.5 flex justify-between text-[11px] text-ivory-faint">
          <span>{short(p.segmentFrom)}</span>
          {/* Ступени целиком — чтобы продавец видел, куда ещё можно дойти, а не
              только следующий шаг. */}
          <span>
            {COMMISSION_TIERS.map((t, i) => (
              <span key={t.from}>
                {i > 0 && " · "}
                <span className={sum >= t.from ? "text-botanical-300" : ""}>
                  {short(t.from)} = {t.percent}%
                </span>
              </span>
            ))}
          </span>
          <span>{done ? "" : short(p.segmentTo)}</span>
        </div>
      )}
    </div>
  );
}
