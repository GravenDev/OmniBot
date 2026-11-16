import type { Message } from "discord.js";

/**
 * Génère un nom pour le fil de discussion en utilisant le template
 */
export function generateThreadName(template: string, message: Message): string {
  const variables = {
    messageAuthor: message.author.displayName || message.author.username,
    messageContent: message.content
      .substring(0, 50)
      .replaceAll("\n", " ")
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
    // A function, not a string: `$&` or `$1` in a name or a message stays
    // as written instead of being read as a replacement pattern.
    threadName = threadName.replaceAll(`{${key}}`, () => value);
  }

  // Limiter à 100 caractères (limite Discord)
  return threadName.substring(0, 100);
}
