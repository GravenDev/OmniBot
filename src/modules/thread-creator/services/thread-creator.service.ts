import { ChannelType, type Message, type TextChannel } from "discord.js";
import prisma from "../../../lib/database.js";
import logger from "../../../lib/logger.js";
import { declareService, type Service } from "../../../lib/service.js";
import type { ThreadCreatorConfig } from "../data/thread-creator.js";

class ThreadCreatorService implements Service {
  private rateLimitMap = new Map<string, number>();
  private readonly RATE_LIMIT_WINDOW = 10000; // 10 secondes
  private readonly MAX_THREADS_PER_WINDOW = 5;

  /**
   * Vérifie si le module est configuré et actif pour ce serveur et ce canal
   */
  async isEnabledForChannel(
    guildId: string,
    channelId: string
  ): Promise<boolean> {
    try {
      const config = await prisma.threadCreatorConfig.findUnique({
        where: { guildId },
      });

      return config?.enabled === true && config.channelId === channelId;
    } catch (error) {
      logger.error(
        `Erreur lors de la vérification de la configuration : ${error}`
      );
      return false;
    }
  }

  /**
   * Vérifie le rate limiting pour éviter de dépasser les limites de l'API Discord
   */
  checkRateLimit(guildId: string): boolean {
    const now = Date.now();
    const windowStart = now - this.RATE_LIMIT_WINDOW;
    const key = `${guildId}:${Math.floor(now / this.RATE_LIMIT_WINDOW)}`;

    const currentCount = this.rateLimitMap.get(key) || 0;

    // Nettoyer les anciennes entrées
    for (const [mapKey, _] of this.rateLimitMap.entries()) {
      const window = parseInt(mapKey.split(":")[1]!);
      if (window * this.RATE_LIMIT_WINDOW < windowStart) {
        this.rateLimitMap.delete(mapKey);
      }
    }

    if (currentCount >= this.MAX_THREADS_PER_WINDOW) {
      return false;
    }

    this.rateLimitMap.set(key, currentCount + 1);
    return true;
  }

  /**
   * Génère un nom pour le fil de discussion en utilisant le template
   */
  generateThreadName(template: string, message: Message): string {
    const variables = {
      messageAuthor: message.author.displayName || message.author.username,
      messageContent: message.content
        .substring(0, 50)
        .replace(/\n/g, " ")
        .trim(),
      timestamp: new Date().toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    let threadName = template;
    for (const [key, value] of Object.entries(variables)) {
      // Escape $ to prevent backreference interpretation in the replacement string
      const safeValue = value.replace(/\$/g, "$$$$");
      threadName = threadName.replace(
        new RegExp(`\\{${key}\\}`, "g"),
        safeValue
      );
    }

    // Limiter à 100 caractères (limite Discord)
    return threadName.substring(0, 100);
  }

  /**
   * Crée un fil de discussion pour le message donné
   */
  async createThreadForMessage(message: Message): Promise<void> {
    if (!message.guild) {
      return;
    }

    const guildId = message.guild.id;
    const channelId = message.channel.id;

    try {
      // Vérifier si le module est activé
      if (!(await this.isEnabledForChannel(guildId, channelId))) {
        return;
      }

      // Vérifier le rate limiting
      if (!this.checkRateLimit(guildId)) {
        logger.warn(
          `Rate limit atteint pour le serveur ${guildId}, création de fil ignorée`
        );
        return;
      }

      // Récupérer la configuration
      const config = await prisma.threadCreatorConfig.findUnique({
        where: { guildId },
      });

      if (!config) {
        logger.warn(`Configuration introuvable pour le serveur ${guildId}`);
        return;
      }

      // Vérifier que le canal supporte les fils de discussion
      const channel = message.channel as TextChannel;
      if (channel.type !== ChannelType.GuildText) {
        logger.warn(
          `Le canal ${channelId} ne supporte pas les fils de discussion`
        );
        return;
      }

      // Générer le nom du fil
      const threadName = this.generateThreadName(
        config.threadNameTemplate,
        message
      );

      // Créer le fil de discussion
      const thread = await message.startThread({
        name: threadName,
        reason: "Création automatique de fil par ThreadCreator",
      });

      // Ajouter le message de bienvenue si configuré
      if (config.welcomeMessage) {
        await thread.send(config.welcomeMessage);
      }

      logger.info(
        `Fil créé avec succès : "${threadName}" dans ${channel.name} (${guildId})`
      );
    } catch (error) {
      // Gestion des erreurs spécifiques à l'API Discord
      if (error instanceof Error && "code" in error) {
        const discordError = error as { code: number };
        if (discordError.code === 160004) {
          logger.warn(
            `Impossible de créer un fil : le message a été supprimé (${guildId})`
          );
        } else if (discordError.code === 160005) {
          logger.warn(
            `Limite de fils de discussion atteinte dans ${channelId} (${guildId})`
          );
        } else if (discordError.code === 50013) {
          logger.warn(
            `Permissions insuffisantes pour créer un fil dans ${channelId} (${guildId})`
          );
        } else {
          logger.error(
            `Erreur lors de la création du fil pour le message ${message.id}: ${error}`
          );
        }
      } else {
        logger.error(
          `Erreur lors de la création du fil pour le message ${message.id}: ${error}`
        );
      }
    }
  }

  /**
   * Met à jour la configuration pour un serveur
   */
  async updateConfig(guildId: string, updates: Partial<ThreadCreatorConfig>) {
    try {
      // Pour la création, channelId est obligatoire
      if (!updates.channelId && !(await this.getConfig(guildId))) {
        throw new Error(
          "channelId est requis pour créer une nouvelle configuration"
        );
      }

      return await prisma.threadCreatorConfig.upsert({
        where: { guildId },
        update: updates,
        create: {
          guildId,
          channelId: updates.channelId!,
          enabled: updates.enabled ?? true,
          threadNameTemplate:
            updates.threadNameTemplate ?? "Discussion - {messageAuthor}",
          ...(updates.welcomeMessage !== undefined && {
            welcomeMessage: updates.welcomeMessage,
          }),
        },
      });
    } catch (error) {
      logger.error(
        `Erreur lors de la mise à jour de la configuration : ${error}`
      );
      throw error;
    }
  }

  /**
   * Récupère la configuration pour un serveur
   */
  async getConfig(guildId: string) {
    try {
      return await prisma.threadCreatorConfig.findUnique({
        where: { guildId },
      });
    } catch (error) {
      logger.error(
        `Erreur lors de la récupération de la configuration : ${error}`
      );
      return null;
    }
  }
}

export default declareService(new ThreadCreatorService());
