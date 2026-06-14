import type { Message } from "discord.js";
import type { ConfigProvider } from "#lib/config.js";
import { declareService, type Service } from "#lib/service.js";
import type { ThreadCreatorConfigSchema } from "#modules/thread-creator/thread-creator.config.js";
import { ThreadCreationQueue } from "./thread-creation-queue.js";

class ThreadCreatorService implements Service {
  private readonly queue = new ThreadCreationQueue();

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
   * Si le message est posté dans l'un des salons surveillés, planifie la
   * création d'un fil via la file d'attente (qui respecte le rate limit Discord
   * sans perdre de message).
   */
  scheduleThreadForMessage(
    message: Message,
    config: ConfigProvider<ThreadCreatorConfigSchema>
  ): void {
    if (!message.guild) {
      return;
    }

    const watchedChannels = config.get("channels");
    if (
      !watchedChannels ||
      !watchedChannels.some((channel) => channel.id === message.channel.id)
    ) {
      return;
    }

    this.queue.enqueue(message.guild.id, {
      message,
      threadName: this.generateThreadName(
        config.get("threadNameTemplate"),
        message
      ),
      welcomeMessage: config.get("welcomeMessage"),
    });
  }
}

export default declareService(new ThreadCreatorService());
