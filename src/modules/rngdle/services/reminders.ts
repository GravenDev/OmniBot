import type { TFunction } from "#lib/i18n.js";

export const REMINDER_HOUR_UTC = 18;

const MESSAGE_LIMIT = 2000;

export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

export function nextUtcMidnight(date: Date): Date {
  const start = startOfUtcDay(date);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

export function reminderTime(date: Date): Date {
  const start = startOfUtcDay(date);
  return new Date(start.getTime() + REMINDER_HOUR_UTC * 60 * 60 * 1000);
}

const timestamp = (date: Date, style: string) =>
  `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;

export function reminderTimestamp(now: Date): string {
  return timestamp(reminderTime(now), "t");
}

export interface ReminderMessage {
  content: string;
  allowedMentions: { users: string[] };
}

export function reminderMessages(
  t: TFunction,
  userIds: string[],
  mentionable: ReadonlySet<string>,
  now: Date
): ReminderMessage[] {
  if (userIds.length === 0) {
    return [];
  }
  const deadline = timestamp(nextUtcMidnight(now), "R");
  const render = (ids: string[]) =>
    t("remind.message", {
      users: ids.map((id) => `<@${id}>`).join(" "),
      deadline,
    });
  const message = (ids: string[]): ReminderMessage => ({
    content: render(ids),
    allowedMentions: { users: ids.filter((id) => mentionable.has(id)) },
  });

  const messages: ReminderMessage[] = [];
  let batch: string[] = [];
  for (const userId of userIds) {
    if (batch.length > 0 && render([...batch, userId]).length > MESSAGE_LIMIT) {
      messages.push(message(batch));
      batch = [];
    }
    batch.push(userId);
  }
  messages.push(message(batch));
  return messages;
}
