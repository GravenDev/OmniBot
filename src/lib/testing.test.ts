import { beforeAll, describe, expect, it } from "vitest";
import { ConfigType, type ConfigSchema } from "./config.js";
import {
  fakeChannel,
  fakeGuild,
  fakeMessage,
  initTestI18n,
  makeTestConfig,
  silenceLogs,
} from "./testing.js";

const schema = {
  title: {
    name: "Title",
    description: "A title",
    type: ConfigType.STRING,
    defaultValue: "hi",
  },
  count: {
    name: "Count",
    description: "A count",
    type: ConfigType.NUMBER,
  },
} satisfies ConfigSchema;

beforeAll(async () => {
  // String defaults resolve through i18n: init once, like any consumer.
  await initTestI18n();
  silenceLogs();
});

describe("makeTestConfig", () => {
  it("serves stored values and schema defaults without a DB", () => {
    const config = makeTestConfig("mod-x", schema, { count: 3 });

    expect(config.get("count")).toBe(3);
    expect(config.get("title")).toBe("hi");
    expect(config.isSet("count")).toBe(true);
    expect(config.isSet("title")).toBe(false);
  });
});

describe("fakes", () => {
  it("builds a guild with a sendable system channel", async () => {
    const { guild, channel, ownerSend } = fakeGuild();

    expect(guild.systemChannel).toBe(channel);
    await channel.send("hello");
    expect(channel.send).toHaveBeenCalledWith("hello");
    expect(ownerSend).not.toHaveBeenCalled();
  });

  it("lets callers override sending to simulate failures", async () => {
    const channel = fakeChannel(async () => {
      throw Object.assign(new Error("forbidden"), { code: 50013 });
    });

    await expect(channel.send("hi")).rejects.toThrow("forbidden");
  });

  it("builds a non-bot guild text message", () => {
    const message = fakeMessage({ content: "ping" });

    expect(message.author.bot).toBe(false);
    expect(message.content).toBe("ping");
    expect(message.channel.isThread()).toBe(false);
  });
});

describe("initTestI18n", () => {
  it("initializes once and registers bundles", async () => {
    silenceLogs();
    await initTestI18n("core", { en: { "test.key": "value" } });
    await initTestI18n("core", { en: { "test.key": "value" } });

    const { createT } = await import("./i18n.js");
    expect(createT("en", "core")("test.key")).toBe("value");
  });
});
