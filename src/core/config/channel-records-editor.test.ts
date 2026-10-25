import {
  ChannelType,
  Collection,
  ComponentType,
  type ModalBuilder,
} from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConfigType,
  type ChannelRecord,
  type ChannelRecordsConfigEntry,
} from "#lib/config.js";
import type { Declared } from "#lib/declared.js";
import type { InteractionHandler } from "#lib/interaction.js";
import type { Module } from "#lib/module.js";
import type { Registry } from "#lib/registry.js";

vi.mock("#core/core.module.js", () => ({
  default: { id: "core", config: {} },
}));
vi.mock("#core/services/config.service.js", () => ({
  default: { getLocaleForGuild: vi.fn(async () => "en") },
}));
const moduleState = vi.hoisted(() => ({ activated: true }));
vi.mock("#core/services/module.service.js", () => ({
  default: { getModuleStateFromGuildIdIn: vi.fn(async () => moduleState) },
}));
vi.mock("#core/utils/core-config.js", () => ({ replyWithCoreT: vi.fn() }));
vi.mock("#lib/i18n.js", () => ({
  createT:
    () =>
    (key: string, vars?: Record<string, unknown>): string =>
      vars && !("defaultValue" in vars)
        ? `${key} ${JSON.stringify(vars)}`
        : key,
}));
vi.mock("./config-edit.js", () => ({
  resolveConfigurableModule: vi.fn(),
  getConfigEntry: vi.fn(),
  refreshSourceConfigMessage: vi.fn(),
}));

const editor = await import("./channel-records-editor.js");
const configEdit = await import("./config-edit.js");

const source = {
  list: vi.fn<(guildId: string) => Promise<ChannelRecord[]>>(),
  save: vi.fn(),
  remove: vi.fn(),
};

const entry: ChannelRecordsConfigEntry = {
  name: "Reactions",
  description: "Channel reactions",
  type: ConfigType.CHANNEL_RECORDS,
  channel: { name: "Channel", channelTypes: [ChannelType.GuildText] },
  fields: { emoji: { name: "Emoji", type: ConfigType.EMOJI } },
  source,
};

const module = { id: "mod", name: "Mod" } as unknown as Module;
const resolved = { module, key: "reactions", entry };
const t = (key: string) => key;

function record(channelId: string, emoji = "👍"): ChannelRecord {
  return { channelId, values: { emoji } };
}

function handlers(): Record<string, Declared<InteractionHandler<never>>> {
  const registered: Declared<InteractionHandler<never>>[] = [];
  editor.registerChannelRecordsEditorHandlers({
    register: (h: Declared<InteractionHandler<never>>) => registered.push(h),
  } as unknown as Registry);
  return Object.fromEntries(registered.map((h) => [h.customId, h]));
}

async function run(id: string, interaction: unknown, args: string[]) {
  await handlers()[id]!.execute(interaction as never, args, {} as never);
}

interface Component {
  type: number;
  custom_id?: string;
  content?: string;
  components?: Component[];
  component?: Component;
}

function flatten(components: Component[]): Component[] {
  return components.flatMap((c) => [
    c,
    ...flatten([
      ...(c.components ?? []),
      ...(c.component ? [c.component] : []),
    ]),
  ]);
}

function rendered(containers: { toJSON(): unknown }[]): Component[] {
  return flatten(containers.map((c) => c.toJSON() as Component));
}

function customIds(components: Component[]): string[] {
  return components.flatMap((c) => (c.custom_id ? [c.custom_id] : []));
}

function texts(components: Component[]): string {
  return components
    .filter((c) => c.type === ComponentType.TextDisplay)
    .map((c) => c.content)
    .join("\n");
}

function guild(channelIds = ["111", "222"]) {
  return {
    id: "g1",
    emojis: { fetch: async () => new Map() },
    channels: {
      cache: new Map(channelIds.map((id) => [id, { id, name: `chan-${id}` }])),
    },
  };
}

function modalSubmit(values: Record<string, string>, channelId?: string) {
  return {
    guildId: "g1",
    guild: guild(),
    user: { id: "admin" },
    isFromMessage: () => true,
    deferUpdate: vi.fn(),
    deferReply: vi.fn(),
    editReply: vi.fn(),
    fields: {
      getTextInputValue: (id: string) => values[id] ?? "",
      getSelectedChannels: () =>
        channelId ? new Collection([[channelId, { id: channelId }]]) : null,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  moduleState.activated = true;
  vi.mocked(configEdit.resolveConfigurableModule).mockReturnValue(module);
  vi.mocked(configEdit.getConfigEntry).mockReturnValue(entry);
  source.list.mockResolvedValue([]);
  source.save.mockResolvedValue({ ok: true, message: "saved" });
  source.remove.mockResolvedValue({ ok: true, message: "removed" });
});

describe("channelRecordsEditorMessage", () => {
  it("lists the records by channel id with edit and remove buttons", () => {
    const components = rendered(
      editor.channelRecordsEditorMessage(
        resolved,
        [record("222", "🎉"), record("111")],
        "src",
        t
      )
    );
    const content = texts(components);
    expect(content.indexOf("<#111> → 👍")).toBeLessThan(
      content.indexOf("<#222> → 🎉")
    );
    expect(customIds(components)).toEqual([
      "channel-records-edit:mod:reactions:src:111",
      "channel-records-remove:mod:reactions:src:0:111",
      "channel-records-edit:mod:reactions:src:222",
      "channel-records-remove:mod:reactions:src:0:222",
      "channel-records-add:mod:reactions:src",
    ]);
  });

  it("paginates and stays within Discord's component cap", () => {
    const records = Array.from({ length: 20 }, (_, i) =>
      record(String(1000 + i))
    );
    const containers = editor.channelRecordsEditorMessage(
      resolved,
      records,
      "src",
      t,
      2
    );
    const components = rendered(containers);
    expect(components.length).toBeLessThanOrEqual(40);
    const ids = customIds(components);
    expect(ids).toContain("channel-records-page:mod:reactions:src:1");
    expect(ids.filter((id) => id.startsWith("channel-records-edit"))).toEqual(
      ["1014", "1015", "1016", "1017", "1018", "1019"].map(
        (id) => `channel-records-edit:mod:reactions:src:${id}`
      )
    );
  });

  it("shows the outcome of the last action", () => {
    const content = texts(
      rendered(
        editor.channelRecordsEditorMessage(resolved, [], "src", t, 0, {
          ok: false,
          message: "nope",
        })
      )
    );
    expect(content).toContain("❌ nope");
    expect(content).toContain("channelRecords.empty");
  });
});

describe("channelRecordModal", () => {
  function inputs(modal: ModalBuilder): Component[] {
    return flatten(
      (modal.toJSON() as unknown as { components: Component[] }).components
    );
  }

  it("asks for the channel when adding", () => {
    const fields = inputs(editor.channelRecordModal(resolved, "src", t));
    expect(
      fields.find((c) => c.type === ComponentType.ChannelSelect)?.custom_id
    ).toBe("channel");
    expect(
      fields.find((c) => c.type === ComponentType.TextInput)?.custom_id
    ).toBe("emoji");
  });

  it("edits the values of an existing channel, prefilled", () => {
    const modal = editor.channelRecordModal(
      resolved,
      "src",
      t,
      record("111", "🎉"),
      "#chan"
    );
    const fields = inputs(modal);
    expect(fields.some((c) => c.type === ComponentType.ChannelSelect)).toBe(
      false
    );
    expect(
      (
        fields.find((c) => c.type === ComponentType.TextInput) as {
          value?: string;
        }
      ).value
    ).toBe("🎉");
    expect(modal.toJSON().custom_id).toBe(
      "channel-records-modal:mod:reactions:src:111"
    );
  });
});

describe("openChannelRecordsEditor", () => {
  it("hides then removes the records of deleted channels", async () => {
    source.list.mockResolvedValue([record("111"), record("999")]);
    const interaction = {
      guildId: "g1",
      guild: guild(["111"]),
      user: { id: "admin" },
      reply: vi.fn(),
    };
    await editor.openChannelRecordsEditor(
      interaction as never,
      module,
      "reactions",
      "src"
    );
    const reply = interaction.reply.mock.calls[0]![0] as {
      components: { toJSON(): unknown }[];
    };
    const content = texts(rendered(reply.components));
    expect(content).toContain("<#111>");
    expect(content).not.toContain("<#999>");
    expect(source.remove).toHaveBeenCalledTimes(1);
    expect(source.remove).toHaveBeenCalledWith(
      interaction.guild,
      "999",
      expect.objectContaining({ userId: "admin" })
    );
    expect(configEdit.refreshSourceConfigMessage).toHaveBeenCalled();
  });

  it("removes nothing when every channel still exists", async () => {
    source.list.mockResolvedValue([record("111")]);
    const interaction = {
      guildId: "g1",
      guild: guild(["111"]),
      user: { id: "admin" },
      reply: vi.fn(),
    };
    await editor.openChannelRecordsEditor(
      interaction as never,
      module,
      "reactions",
      "src"
    );
    expect(source.remove).not.toHaveBeenCalled();
    expect(configEdit.refreshSourceConfigMessage).not.toHaveBeenCalled();
  });
});

describe("channel records handlers", () => {
  it("saves the record picked in the modal and refreshes the panel", async () => {
    source.list.mockResolvedValue([record("111")]);
    const interaction = modalSubmit({ emoji: " 👍 " }, "111");
    await run("channel-records-modal", interaction, [
      "mod",
      "reactions",
      "src",
    ]);

    expect(source.save).toHaveBeenCalledWith(
      interaction.guild,
      { channelId: "111", values: { emoji: "👍" } },
      expect.objectContaining({ userId: "admin" })
    );
    const reply = interaction.editReply.mock.calls[0]![0] as {
      components: { toJSON(): unknown }[];
    };
    expect(texts(rendered(reply.components))).toContain("✅ saved");
    expect(configEdit.refreshSourceConfigMessage).toHaveBeenCalled();
  });

  it("keeps the edited channel from the custom id", async () => {
    const interaction = modalSubmit({ emoji: "🎉" });
    await run("channel-records-modal", interaction, [
      "mod",
      "reactions",
      "src",
      "222",
    ]);
    expect(source.save).toHaveBeenCalledWith(
      interaction.guild,
      { channelId: "222", values: { emoji: "🎉" } },
      expect.anything()
    );
  });

  it("refuses a value that is not an emoji without saving", async () => {
    const interaction = modalSubmit({ emoji: "hello" }, "111");
    await run("channel-records-modal", interaction, [
      "mod",
      "reactions",
      "src",
    ]);
    expect(source.save).not.toHaveBeenCalled();
    const reply = interaction.editReply.mock.calls[0]![0] as {
      components: { toJSON(): unknown }[];
    };
    expect(texts(rendered(reply.components))).toContain(
      "❌ channelRecords.invalidEmoji"
    );
    expect(configEdit.refreshSourceConfigMessage).not.toHaveBeenCalled();
  });

  it("removes a record and refreshes the panel", async () => {
    const interaction = {
      guildId: "g1",
      guild: guild(),
      user: { id: "admin" },
      deferUpdate: vi.fn(),
      editReply: vi.fn(),
    };
    await run("channel-records-remove", interaction, [
      "mod",
      "reactions",
      "src",
      "0",
      "111",
    ]);
    expect(source.remove).toHaveBeenCalledWith(
      interaction.guild,
      "111",
      expect.objectContaining({ userId: "admin" })
    );
    expect(configEdit.refreshSourceConfigMessage).toHaveBeenCalled();
  });

  it("says so when the edited record is gone instead of opening a modal", async () => {
    const interaction = {
      guildId: "g1",
      guild: guild(),
      update: vi.fn(),
      showModal: vi.fn(),
    };
    await run("channel-records-edit", interaction, [
      "mod",
      "reactions",
      "src",
      "111",
    ]);
    expect(interaction.showModal).not.toHaveBeenCalled();
    const update = interaction.update.mock.calls[0]![0] as {
      components: { toJSON(): unknown }[];
    };
    expect(texts(rendered(update.components))).toContain(
      "❌ channelRecords.gone"
    );
  });

  it("opens the edit form empty rather than missing the modal deadline", async () => {
    vi.useFakeTimers();
    try {
      source.list.mockReturnValue(new Promise(() => {}));
      const interaction = {
        guildId: "g1",
        guild: guild(),
        createdTimestamp: Date.now(),
        update: vi.fn(),
        showModal: vi.fn(),
      };
      const running = run("channel-records-edit", interaction, [
        "mod",
        "reactions",
        "src",
        "111",
      ]);
      await vi.advanceTimersByTimeAsync(1500);
      await running;
      expect(interaction.showModal).toHaveBeenCalledTimes(1);
      const modal = interaction.showModal.mock.calls[0]![0] as ModalBuilder;
      expect(modal.toJSON().custom_id).toBe(
        "channel-records-modal:mod:reactions:src:111"
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses to save the records of a disabled module", async () => {
    moduleState.activated = false;
    const interaction = modalSubmit({ emoji: "👍" }, "111");
    await run("channel-records-modal", interaction, [
      "mod",
      "reactions",
      "src",
    ]);
    expect(source.save).not.toHaveBeenCalled();
    const { replyWithCoreT } = await import("#core/utils/core-config.js");
    expect(replyWithCoreT).toHaveBeenCalledWith(
      interaction,
      "interaction.moduleNotEnabled"
    );
  });

  it("refuses a key that is not a channel records entry", async () => {
    vi.mocked(configEdit.getConfigEntry).mockReturnValue({
      name: "x",
      description: "",
      type: ConfigType.STRING,
    });
    const interaction = { guildId: "g1", showModal: vi.fn() };
    await run("channel-records-add", interaction, ["mod", "other", "src"]);
    expect(interaction.showModal).not.toHaveBeenCalled();
  });
});
