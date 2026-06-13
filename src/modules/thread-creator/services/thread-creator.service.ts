import { ChannelType, type Message, type TextChannel } from "discord.js";
import type { ConfigProvider } from "../../../lib/config.js";
import logger from "../../../lib/logger.js";
import { declareService, type Service } from "../../../lib/service.js";
import type { ThreadCreatorConfigSchema } from "../thread-creator.config.js";

class ThreadCreatorService implements Service {
  private rateLimitMap = new Map<string, number>();
  private readonly RATE_LIMIT_WINDOW = 10000; // 10 secondes
  private readonly MAX_THREADS_PER_WINDOW = 5;

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
   * Crée un fil de discussion pour le message donné, selon la configuration du module.
   */
  async createThreadForMessage(
    message: Message,
    config: ConfigProvider<ThreadCreatorConfigSchema>
  ): Promise<void> {
    if (!message.guild) {
      return;
    }

    const guildId = message.guild.id;

    try {
      // Le module ne surveille que le canal configuré
      const watchedChannel = config.get("channel");
      if (!watchedChannel || watchedChannel.id !== message.channel.id) {
        return;
      }

      // Vérifier le rate limiting
      if (!this.checkRateLimit(guildId)) {
        logger.warn(
          `Rate limit atteint pour le serveur ${guildId}, création de fil ignorée`
        );
        return;
      }

      // Vérifier que le canal supporte les fils de discussion
      const channel = message.channel as TextChannel;
      if (channel.type !== ChannelType.GuildText) {
        logger.warn(
          `Le canal ${message.channel.id} ne supporte pas les fils de discussion`
        );
        return;
      }

      // Générer le nom du fil
      const threadName = this.generateThreadName(
        config.get("threadNameTemplate"),
        message
      );

      // Créer le fil de discussion
      const thread = await message.startThread({
        name: threadName,
        reason: "Création automatique de fil par ThreadCreator",
      });

      // Ajouter le message de bienvenue si configuré
      const welcomeMessage = config.get("welcomeMessage");
      if (welcomeMessage) {
        await thread.send(welcomeMessage);
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
            `Limite de fils de discussion atteinte dans ${message.channel.id} (${guildId})`
          );
        } else if (discordError.code === 50013) {
          logger.warn(
            `Permissions insuffisantes pour créer un fil dans ${message.channel.id} (${guildId})`
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
}

export default declareService(new ThreadCreatorService());
