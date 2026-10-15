import { DiscordAPIError } from "discord.js";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initTestI18n, makeTestConfig, silenceLogs } from "#lib/testing.js";
import { reportsConfigSchema } from "../reports.config.js";
import type { MessageSnapshot } from "./store.js";

vi.mock("#lib/database.js", () => ({ default: {}, Prisma: {} }));

const db = vi.hoisted(() => {
  const reports: any[] = [];
  const store = {
    byMessage: vi.fn(
      async (guildId: string, messageId: string) =>
        reports.find(
          (r) => r.guildId === guildId && r.messageId === messageId
        ) ?? null
    ),
    byId: vi.fn(
      async (guildId: string, id: number) =>
        reports.find((r) => r.guildId === guildId && r.id === id) ?? null
    ),
    create: vi.fn(
      async (snapshot: any, reporter: any, reactionKept: boolean) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        const report = {
          ...snapshot,
          id: reports.length + 1,
          messageCreatedAt: snapshot.createdAt,
          messageState: "present",
          editedContent: null,
          reactionKept,
          alertChannelId: null,
          alertMessageId: null,
          status: "open",
          handledBy: null,
          handledAt: null,
          reporters: [{ ...reporter, reportedAt: new Date() }],
          actions: [],
        };
        reports.push(report);
        return report;
      }
    ),
    addReporter: vi.fn(async (id: number, reporter: any) => {
      const report = reports.find((r) => r.id === id);
      if (report.reporters.some((r: any) => r.userId === reporter.userId)) {
        return false;
      }
      report.reporters.push({ ...reporter, reportedAt: new Date() });
      return true;
    }),
    setAlert: vi.fn(
      async (id: number, channelId: string, messageId: string) => {
        const report = reports.find((r) => r.id === id);
        report.alertChannelId = channelId;
        report.alertMessageId = messageId;
      }
    ),
    setStatus: vi.fn(async (id: number, status: string) => {
      reports.find((r) => r.id === id).status = status;
    }),
    setMessageState: vi.fn(
      async (id: number, state: string, editedContent?: string) => {
        const report = reports.find((r) => r.id === id);
        report.messageState = state;
        if (editedContent !== undefined) report.editedContent = editedContent;
      }
    ),
    authorHistory: vi.fn(async () => ({ total: 0, sanctioned: 0 })),
  };
  return { reports, store };
});

vi.mock("./store.js", () => ({ default: db.store }));

const {
  default: service,
  ineligibility,
  matchesEmoji,
} = await import("./report.service.js");

beforeAll(async () => {
  await initTestI18n();
  silenceLogs();
});

function setup(options: { alertMissing?: boolean; canSend?: boolean } = {}) {
  const alertChannel = {
    id: "alerts",
    isSendable: () => true,
    isDMBased: () => false,
    guild: { members: { me: { id: "bot" } } },
    permissionsFor: () => ({ has: () => options.canSend ?? true }),
    send: vi.fn(async () => ({ channelId: "alerts", id: "alert-1" })),
    messages: {
      edit: vi.fn(async () => {
        if (options.alertMissing) {
          throw new DiscordAPIError(
            { code: 10008, message: "Unknown Message" },
            10008,
            404,
            "PATCH",
            "/channels/alerts/messages/alert-1",
            {}
          );
        }
        return {};
      }),
    },
  };
  const alert = { edit: alertChannel.messages.edit };
  const client = {
    channels: { fetch: vi.fn(async () => alertChannel) },
  } as any;
  const config = makeTestConfig("reports", reportsConfigSchema, {
    alertChannel: alertChannel as any,
    moderatorRole: { id: "role-9" } as any,
  });
  return { client, config, alert, alertChannel };
}

const snapshot: MessageSnapshot = {
  guildId: "g1",
  channelId: "c1",
  messageId: "m1",
  authorId: "author",
  content: "insult",
  attachments: [],
  createdAt: new Date("2026-10-01T10:00:00Z"),
};

const reporter = (userId: string) => ({
  userId,
  source: "reaction" as const,
  reason: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.reports.length = 0;
});

describe("report", () => {
  it("creates one alert and pings the moderator role", async () => {
    const { client, config, alertChannel } = setup();

    const outcome = await service.report(
      client,
      config,
      snapshot,
      reporter("r1"),
      false
    );

    expect(outcome).toBe("created");
    expect(alertChannel.send).toHaveBeenCalledOnce();
    expect(alertChannel.send.mock.calls[0]![0]).toMatchObject({
      allowedMentions: { parse: [], roles: ["role-9"] },
    });
    expect(db.store.setAlert).toHaveBeenCalledWith(1, "alerts", "alert-1");
  });

  it("adds later reporters to the same alert instead of a new one", async () => {
    const { client, config, alert, alertChannel } = setup();
    await service.report(client, config, snapshot, reporter("r1"), false);

    const outcome = await service.report(
      client,
      config,
      snapshot,
      reporter("r2"),
      false
    );

    expect(outcome).toBe("added");
    expect(alertChannel.send).toHaveBeenCalledOnce();
    expect(alert.edit).toHaveBeenCalledOnce();
    expect(db.reports[0].reporters).toHaveLength(2);
  });

  it("serializes simultaneous reports of one message into a single alert", async () => {
    const { client, config, alertChannel } = setup();

    const outcomes = await Promise.all([
      service.report(client, config, snapshot, reporter("r1"), false),
      service.report(client, config, snapshot, reporter("r2"), false),
    ]);

    expect(outcomes).toEqual(["created", "added"]);
    expect(db.store.create).toHaveBeenCalledOnce();
    expect(alertChannel.send).toHaveBeenCalledOnce();
  });

  it("ignores a second report by the same member", async () => {
    const { client, config, alert } = setup();
    await service.report(client, config, snapshot, reporter("r1"), false);

    const outcome = await service.report(
      client,
      config,
      snapshot,
      reporter("r1"),
      false
    );

    expect(outcome).toBe("duplicate");
    expect(alert.edit).not.toHaveBeenCalled();
  });

  it("reopens a closed report and pings in reply to its alert", async () => {
    const { client, config, alert, alertChannel } = setup();
    await service.report(client, config, snapshot, reporter("r1"), false);
    db.reports[0].status = "dismissed";

    const outcome = await service.report(
      client,
      config,
      snapshot,
      reporter("r2"),
      false
    );

    expect(outcome).toBe("reopened");
    expect(db.store.setStatus).toHaveBeenCalledWith(1, "open", null);
    expect(alert.edit).toHaveBeenCalledOnce();
    expect(alertChannel.send).toHaveBeenCalledTimes(2);
    expect(alertChannel.send.mock.calls[1]![0]).toMatchObject({
      allowedMentions: { parse: [], roles: ["role-9"] },
      reply: { messageReference: "alert-1", failIfNotExists: false },
    });
  });

  it("updates the alert without reading the channel history", async () => {
    const { client, config, alertChannel } = setup();
    await service.report(client, config, snapshot, reporter("r1"), false);

    await service.report(client, config, snapshot, reporter("r2"), false);

    expect(alertChannel.messages.edit).toHaveBeenCalledWith(
      "alert-1",
      expect.anything()
    );
    expect(alertChannel.messages).not.toHaveProperty("fetch");
  });

  it("posts a fresh alert when the previous one was deleted", async () => {
    const { client, config, alertChannel } = setup({ alertMissing: true });
    await service.report(client, config, snapshot, reporter("r1"), false);

    await service.report(client, config, snapshot, reporter("r2"), false);

    expect(alertChannel.send).toHaveBeenCalledTimes(2);
  });

  it("does not republish the deleted alert of a closed report", async () => {
    const { client, config, alertChannel } = setup({ alertMissing: true });
    await service.report(client, config, snapshot, reporter("r1"), false);
    db.reports[0].status = "resolved";

    await service.messageChanged(client, config, "g1", "m1", { deleted: true });

    expect(db.store.setMessageState).toHaveBeenCalledWith(1, "deleted");
    expect(alertChannel.send).toHaveBeenCalledOnce();
  });

  it("does nothing while the bot cannot post in the alert channel", async () => {
    const { client, config, alertChannel } = setup({ canSend: false });

    const outcome = await service.report(
      client,
      config,
      snapshot,
      reporter("r1"),
      false
    );

    expect(outcome).toBe("unconfigured");
    expect(db.store.byMessage).not.toHaveBeenCalled();
    expect(alertChannel.send).not.toHaveBeenCalled();
  });

  it("does nothing until an alert channel is configured", async () => {
    const { client } = setup();
    const config = makeTestConfig("reports", reportsConfigSchema, {});

    const outcome = await service.report(
      client,
      config,
      snapshot,
      reporter("r1"),
      false
    );

    expect(outcome).toBe("unconfigured");
    expect(db.store.byMessage).not.toHaveBeenCalled();
  });
});

describe("messageChanged", () => {
  it("records an edit once and ignores an unchanged update", async () => {
    const { client, config, alert } = setup();
    await service.report(client, config, snapshot, reporter("r1"), false);

    await service.messageChanged(client, config, "g1", "m1", {
      deleted: false,
      content: async () => "insult",
    });
    expect(db.store.setMessageState).not.toHaveBeenCalled();

    await service.messageChanged(client, config, "g1", "m1", {
      deleted: false,
      content: async () => "sorry",
    });
    expect(db.store.setMessageState).toHaveBeenCalledWith(1, "edited", "sorry");
    expect(alert.edit).toHaveBeenCalledOnce();
  });

  it("marks a deleted message and never reads unreported ones", async () => {
    const { client, config } = setup();
    await service.report(client, config, snapshot, reporter("r1"), false);
    const content = vi.fn(async () => "x");

    await service.messageChanged(client, config, "g1", "other", {
      deleted: false,
      content,
    });
    await service.messageChanged(client, config, "g1", "m1", { deleted: true });

    expect(content).not.toHaveBeenCalled();
    expect(db.store.setMessageState).toHaveBeenCalledWith(1, "deleted");
  });
});

describe("matchesEmoji", () => {
  it("matches a unicode emoji with or without its variation selector", () => {
    expect(matchesEmoji("🚩", { id: null, name: "🚩" })).toBe(true);
    expect(matchesEmoji("⚠️", { id: null, name: "⚠" })).toBe(true);
    expect(matchesEmoji("🚩", { id: null, name: "👍" })).toBe(false);
  });

  it("matches a custom emoji by id only", () => {
    const custom = "<:report:123456789012345678>";
    expect(
      matchesEmoji(custom, { id: "123456789012345678", name: "renamed" })
    ).toBe(true);
    expect(matchesEmoji(custom, { id: "999", name: "report" })).toBe(false);
    expect(matchesEmoji("🚩", { id: "1", name: "🚩" })).toBe(false);
  });
});

describe("ineligibility", () => {
  const message = (overrides: Record<string, any> = {}) =>
    ({
      author: { id: "author", bot: false },
      system: false,
      channelId: "c1",
      channel: { isThread: () => false },
      ...overrides,
    }) as any;

  it("accepts a regular message from someone else", () => {
    expect(ineligibility(message(), "reporter", "alerts")).toBeNull();
  });

  it("rejects bots, system messages and your own messages", () => {
    expect(
      ineligibility(message({ author: { id: "a", bot: true } }), "r", "alerts")
    ).toBe("bot");
    expect(ineligibility(message({ system: true }), "r", "alerts")).toBe("bot");
    expect(ineligibility(message(), "author", "alerts")).toBe("self");
  });

  it("rejects the alert channel and its threads", () => {
    expect(ineligibility(message({ channelId: "alerts" }), "r", "alerts")).toBe(
      "alertChannel"
    );
    expect(
      ineligibility(
        message({
          channelId: "thread",
          channel: { isThread: () => true, parentId: "alerts" },
        }),
        "r",
        "alerts"
      )
    ).toBe("alertChannel");
  });
});
