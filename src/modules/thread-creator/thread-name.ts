import type { Message } from "discord.js";

/**
 * Génère un nom pour le fil de discussion en utilisant le template
 */
export function generateThreadName(template: string, message: Message): string {
  const variables = {
    messageAuthor: message.author.displayName || message.author.username,
    messageContent: message.content.substring(0, 50).replace(/\n/g, " ").trim(),
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
    threadName = threadName.replace(new RegExp(`\\{${key}\\}`, "g"), safeValue);
  }

  // Limiter à 100 caractères (limite Discord)
  return threadName.substring(0, 100);
}
