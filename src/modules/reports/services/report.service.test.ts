import { DiscordAPIError } from "discord.js";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initTestI18n, makeTestConfig, silenceLogs } from "#lib/testing.js";
import { reportsConfigSchema } from "../reports.config.js";
import type { MessageSnapshot } from "./store.service.js";

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
    reportedAmong: vi.fn(async (guildId: string, ids: string[]) =>
      reports
        .filter((r) => r.guildId === guildId && ids.includes(r.messageId))
        .map((r) => r.messageId)
    ),
    authorHistory: vi.fn(async () => ({ total: 0, sanctioned: 0 })),
    delete: vi.fn(async (id: number) => {
      const index = reports.findIndex((r) => r.id === id);
      if (index !== -1) reports.splice(index, 1);
    }),
  };
  return { reports, store };
});

vi.mock("./store.service.js", () => ({ default: db.store }));

const { default: service } = await import("./report.service.js");

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

  it("deletes the alert it could not record, so the next report posts one", async () => {
    const { client, config, alertChannel } = setup();
    const sent = {
      channelId: "alerts",
      id: "alert-1",
      delete: vi.fn(async () => ({})),
    };
    alertChannel.send.mockResolvedValueOnce(sent);
    db.store.setAlert.mockRejectedValueOnce(new Error("database down"));

    await expect(
      service.report(client, config, snapshot, reporter("r1"), false)
    ).rejects.toThrow("database down");

    expect(sent.delete).toHaveBeenCalledOnce();
  });

  it("forgets a report whose alert could not be posted, so reporting again files it", async () => {
    const { client, config, alertChannel } = setup();
    alertChannel.send.mockRejectedValueOnce(new Error("Discord down"));

    await expect(
      service.report(client, config, snapshot, reporter("r1"), false)
    ).rejects.toThrow("Discord down");

    expect(
      await service.report(client, config, snapshot, reporter("r1"), false)
    ).toBe("created");
    expect(alertChannel.send).toHaveBeenCalledTimes(2);
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

describe("messagesDeleted", () => {
  it("looks the messages up in one query and marks only the reported ones", async () => {
    const { client, config } = setup();
    await service.report(client, config, snapshot, reporter("r1"), false);
    db.store.byMessage.mockClear();

    await service.messagesDeleted(client, config, "g1", ["m0", "m1", "m2"]);

    expect(db.store.reportedAmong).toHaveBeenCalledOnce();
    expect(db.store.byMessage).toHaveBeenCalledOnce();
    expect(db.store.setMessageState).toHaveBeenCalledWith(1, "deleted");
  });

  it("marks deleted a message whose report was being filed", async () => {
    const { client, config } = setup();

    const filing = service.report(
      client,
      config,
      snapshot,
      reporter("r1"),
      false
    );
    await service.messagesDeleted(client, config, "g1", ["m1"]);
    await filing;

    expect(db.store.setMessageState).toHaveBeenCalledWith(1, "deleted");
  });

  it("marks deleted a message reported while the query ran", async () => {
    const { client, config } = setup();
    let answer!: (ids: string[]) => void;
    db.store.reportedAmong.mockImplementationOnce(
      () => new Promise<string[]>((resolve) => (answer = resolve))
    );

    const deleting = service.messagesDeleted(client, config, "g1", ["m1"]);
    const filing = service.report(
      client,
      config,
      snapshot,
      reporter("r1"),
      false
    );
    // The query read before the report's row was written.
    answer([]);
    await Promise.all([deleting, filing]);

    expect(db.store.setMessageState).toHaveBeenCalledWith(1, "deleted");
  });

  it("still marks the other reported messages when one fails", async () => {
    const { client, config } = setup();
    await service.report(client, config, snapshot, reporter("r1"), false);
    await service.report(
      client,
      config,
      { ...snapshot, messageId: "m2" },
      reporter("r1"),
      false
    );
    db.store.byMessage.mockRejectedValueOnce(new Error("database down"));

    await expect(
      service.messagesDeleted(client, config, "g1", ["m1", "m2"])
    ).resolves.toBeUndefined();

    expect(db.store.setMessageState).toHaveBeenCalledWith(2, "deleted");
  });

  it("still marks a report being filed when the query fails", async () => {
    const { client, config } = setup();
    db.store.reportedAmong.mockRejectedValueOnce(new Error("database down"));

    const filing = service.report(
      client,
      config,
      snapshot,
      reporter("r1"),
      false
    );
    await expect(
      service.messagesDeleted(client, config, "g1", ["m1", "m2"])
    ).resolves.toBeUndefined();
    await filing;

    expect(db.store.setMessageState).toHaveBeenCalledWith(1, "deleted");
  });
});
