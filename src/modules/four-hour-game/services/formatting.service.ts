import type { TFunction } from "#lib/i18n.js";
import { declareService, type Service } from "#lib/service.js";
import type { PlayerRank } from "./four-hour-game.service.js";

const UNITS = [
  ["days", 24 * 60 * 60],
  ["hours", 60 * 60],
  ["minutes", 60],
  ["seconds", 1],
] as const;

export class FormattingService implements Service {
  formatHeldTime(totalSeconds: number, t: TFunction): string {
    const seconds = Number.isFinite(totalSeconds)
      ? Math.max(0, Math.floor(totalSeconds))
      : 0;
    const first = UNITS.findIndex(([, size]) => seconds >= size);
    if (first === -1) {
      return t("duration.seconds", { value: 0 });
    }

    const parts: string[] = [];
    let remaining = seconds;
    for (const [unit, size] of UNITS.slice(first, first + 2)) {
      const amount = Math.floor(remaining / size);
      remaining -= amount * size;
      if (amount > 0) {
        parts.push(t(`duration.${unit}`, { value: amount }));
      }
    }
    return parts.join(" ");
  }

  formatRank({ rank, total }: PlayerRank, t: TFunction): string {
    return t("rank.position", {
      position: t("rank.place", { count: rank, ordinal: true }),
      total,
    });
  }
}

export default declareService(new FormattingService());
