import prisma from "#lib/database.js";
import { declareService, type Service } from "#lib/service.js";

export type ImcCategory = "underweight" | "normal" | "overweight" | "obesity";

export type LeaderboardOrder = "worst" | "best";

/**
 * Bornes de la plage IMC considérée comme idéale (catégorie "normal" OMS).
 */
export const IDEAL_BMI_MIN = 18.5;
export const IDEAL_BMI_MAX = 25;

/**
 * Calcule l'IMC à partir du poids (kg) et de la taille (cm).
 */
export function calculateBmi(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

/**
 * Retourne la catégorie d'IMC selon les seuils OMS.
 */
export function categoryForBmi(bmi: number): ImcCategory {
  if (bmi < 18.5) {
    return "underweight";
  }
  if (bmi < 25) {
    return "normal";
  }
  if (bmi < 30) {
    return "overweight";
  }
  return "obesity";
}

/**
 * Écart entre un IMC et la plage idéale : 0 si l'IMC est dans la plage,
 * sinon la distance à la borne la plus proche.
 */
export function distanceToIdeal(bmi: number): number {
  if (bmi < IDEAL_BMI_MIN) {
    return IDEAL_BMI_MIN - bmi;
  }
  if (bmi >= IDEAL_BMI_MAX) {
    return bmi - IDEAL_BMI_MAX;
  }
  return 0;
}

export interface RankedEntry<T = { bmi: number }> {
  entry: T;
  deviation: number;
}

/**
 * Classe des entrées par écart à l'idéal (fonction pure, testable sans BDD).
 * Ordre "worst" : les plus éloignés en premier ; "best" : l'inverse.
 * Égalité d'écart départagée par l'IMC (même sens que le tri).
 */
export function rankEntries<T extends { bmi: number }>(
  entries: T[],
  order: LeaderboardOrder
): RankedEntry<T>[] {
  const direction = order === "worst" ? 1 : -1;
  return entries
    .map((entry) => ({ entry, deviation: distanceToIdeal(entry.bmi) }))
    .sort(
      (a, b) =>
        direction * (b.deviation - a.deviation || b.entry.bmi - a.entry.bmi)
    );
}

class ImcService implements Service {
  /**
   * Enregistre (ou met à jour) l'IMC d'un membre sur un serveur.
   */
  async saveEntry(
    guildId: string,
    userId: string,
    weightKg: number,
    heightCm: number
  ) {
    const bmi = calculateBmi(weightKg, heightCm);
    return await prisma.imcEntry.upsert({
      where: { guildId_userId: { guildId, userId } },
      create: { guildId, userId, weightKg, heightCm, bmi },
      update: { weightKg, heightCm, bmi },
    });
  }

  /**
   * Récupère l'entrée IMC d'un membre sur un serveur, `null` si absente.
   */
  async getEntry(guildId: string, userId: string) {
    return await prisma.imcEntry.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
  }

  /**
   * Classement des IMC d'un serveur, triés par écart à l'idéal.
   * Le tri se fait en mémoire (calcul non exprimable en SQL simple) puis
   * tronqué à `limit` — négligeable à l'échelle d'un serveur Discord.
   */
  async getLeaderboard(
    guildId: string,
    limit: number,
    order: LeaderboardOrder = "worst"
  ) {
    const entries = await prisma.imcEntry.findMany({
      where: { guildId },
    });
    return rankEntries(entries, order).slice(0, limit);
  }
}

export default declareService(new ImcService());
