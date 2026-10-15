import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initTestI18n, makeTestConfig, silenceLogs } from "#lib/testing.js";
import { reportsConfigSchema } from "../reports.config.js";

vi.mock("#lib/database.js", () => ({ default: {}, Prisma: {} }));

const mocks = vi.hoisted(() => {
  const report = {
    id: 1,
    guildId: "g1",
    channelId: "reported-channel",
    messageId: "m1",
    messageState: "present",
    status: "open",
  };
  return {
    report,
    store: {
      addAction: vi.fn(async () => {}),
      setMessageState: vi.fn(async () => {}),
      setStatus: vi.fn(async () => {}),
    },
    service: {
      withReport: vi.fn(async (_g: string, _id: number, task: any) =>
        task(report)
      ),
      publish: vi.fn(async () => {}),
    },
  };
});

vi.mock("../services/store.js", () => ({ default: mocks.store }));
vi.mock("../services/report.service.js", () => ({ default: mocks.service }));

const { alertButtonHandlers } = await import("./alert-actions.js");

beforeAll(async () => {
  await initTestI18n();
  silenceLogs();
});

beforeEach(() => {
  vi.clearAllMocks();
});

function setup(canManageThere: boolean) {
  const reportedChannel = {
    isTextBased: () => true,
    permissionsFor: vi.fn(() => ({ has: () => canManageThere })),
    messages: { delete: vi.fn(async () => {}) },
  };
  const interaction = {
    guildId: "g1",
    user: { id: "mod" },
    client: {},
    deferred: false,
    replied: false,
    guild: {
      channels: { fetch: vi.fn(async () => reportedChannel) },
      members: { fetch: vi.fn(async () => ({ id: "mod" })) },
    },
    deferUpdate: vi.fn(async function (this: any) {
      this.deferred = true;
    }),
    followUp: vi.fn(async () => {}),
    reply: vi.fn(async () => {}),
  };
  const config = makeTestConfig("reports", reportsConfigSchema, {});
  return { interaction, reportedChannel, config };
}

const deleteButton = alertButtonHandlers.find(
  (handler) => handler.customId === "report-delete"
)!;

describe("delete button", () => {
  it("refuses a moderator who cannot manage messages in the reported channel", async () => {
    const { interaction, reportedChannel, config } = setup(false);

    await deleteButton.execute(interaction as any, ["1"], config);

    expect(reportedChannel.messages.delete).not.toHaveBeenCalled();
    expect(mocks.store.addAction).not.toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({
        content: config.t("error.memberCannotDelete"),
      })
    );
  });

  it("deletes the message when the moderator may manage it there", async () => {
    const { interaction, reportedChannel, config } = setup(true);

    await deleteButton.execute(interaction as any, ["1"], config);

    expect(reportedChannel.permissionsFor).toHaveBeenCalledWith({ id: "mod" });
    expect(reportedChannel.messages.delete).toHaveBeenCalledWith("m1");
    expect(mocks.store.setMessageState).toHaveBeenCalledWith(1, "deleted");
  });
});
