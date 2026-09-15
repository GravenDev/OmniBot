import prisma from "#lib/database.js";
import { declareService, type Service } from "#lib/service.js";

export type ImcCategory = "underweight" | "normal" | "overweight" | "obesity";

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
   * Classement des IMC d'un serveur, triés par IMC décroissant.
   */
  async getLeaderboard(guildId: string, limit: number) {
    return await prisma.imcEntry.findMany({
      where: { guildId },
      orderBy: { bmi: "desc" },
      take: limit,
    });
  }
}

export default declareService(new ImcService());
