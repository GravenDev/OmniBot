import type { TFunction } from "#lib/i18n.js";
import { declareService, type Service } from "#lib/service.js";

export const REMINDER_HOUR_UTC = 18;

const MESSAGE_LIMIT = 2000;

export interface ReminderMessage {
  content: string;
  allowedMentions: { users: string[] };
}

export class RemindersService implements Service {
  startOfUtcDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    );
  }

  nextUtcMidnight(date: Date): Date {
    const start = this.startOfUtcDay(date);
    return new Date(start.getTime() + 24 * 60 * 60 * 1000);
  }

  reminderTime(date: Date): Date {
    const start = this.startOfUtcDay(date);
    return new Date(start.getTime() + REMINDER_HOUR_UTC * 60 * 60 * 1000);
  }

  private timestamp(date: Date, style: string): string {
    return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
  }

  reminderTimestamp(now: Date): string {
    return this.timestamp(this.reminderTime(now), "t");
  }

  reminderMessages(
    t: TFunction,
    userIds: string[],
    mentionable: ReadonlySet<string>,
    now: Date
  ): ReminderMessage[] {
    if (userIds.length === 0) {
      return [];
    }
    const deadline = this.timestamp(this.nextUtcMidnight(now), "R");
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
      if (
        batch.length > 0 &&
        render([...batch, userId]).length > MESSAGE_LIMIT
      ) {
        messages.push(message(batch));
        batch = [];
      }
      batch.push(userId);
    }
    messages.push(message(batch));
    return messages;
  }
}

export default declareService(new RemindersService());
