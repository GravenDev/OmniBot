import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function toCamel(id: string): string {
  return id.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function toPascal(id: string): string {
  const camel = toCamel(id);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

const MODULE_TS = `import { GatewayIntentBits } from "discord.js";
import { defineModule } from "#lib/module.js";
import helloCommand from "./commands/hello.command.js";
import messageListener from "./listeners/message.listener.js";
import { __CAMEL__ConfigSchema } from "./__ID__.config.js";

export default defineModule({
  id: "__ID__",
  name: "__NAME__",
  description: "TODO: describe what this module does.",
  version: "0.1.0",

  config: __CAMEL__ConfigSchema,

  // Non-privileged intents only: no portal toggle needed. Add
  // GatewayIntentBits.MessageContent only if you read message text (privileged).
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],

  onLoad(_client, registry) {
    registry.register(helloCommand);
    registry.register(messageListener);
  },
});
`;

const CONFIG_TS = `import { ConfigType, type ConfigSchema } from "#lib/config.js";

export const __CAMEL__ConfigSchema = {
  announcement: {
    name: "Announcement",
    description: "Message posted by the hello command.",
    type: ConfigType.STRING,
    defaultValue: "Hello!",
  },
} satisfies ConfigSchema;

export type __PASCAL__ConfigSchema = typeof __CAMEL__ConfigSchema;
`;

const COMMAND_TS = `import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { declareCommand } from "#lib/command.js";
import type { __PASCAL__ConfigSchema } from "../__ID__.config.js";

// Command names are matched first-come-first-served across ALL modules:
// always prefix with your module id.
export default declareCommand<__PASCAL__ConfigSchema>({
  data: new SlashCommandBuilder()
    .setName("__ID__-hello")
    .setDescription("Replies with the configured announcement."),
  async execute(interaction, config) {
    await interaction.reply({
      content: config.get("announcement"),
      flags: MessageFlags.Ephemeral,
    });
  },
});
`;

const LISTENER_TS = `import { ChannelType } from "discord.js";
import { declareEventListener } from "#lib/listener.js";
import logger from "#lib/logger.js";
import type { __PASCAL__ConfigSchema } from "../__ID__.config.js";

export default declareEventListener<"messageCreate", __PASCAL__ConfigSchema>({
  eventType: "messageCreate",
  async execute(message, config) {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (message.channel.type !== ChannelType.GuildText) return;
    // Listeners run with \`undefined\` config outside guilds: never drop this guard.
    if (!config) return;

    logger.debug(
      \`Saw message | guild = \${message.guild.id} | announcement = \${config.get("announcement")}\`
    );
  },
});
`;

const I18N_EN = `{
  "modules.__ID__.name": "__NAME__",
  "modules.__ID__.description": "TODO: describe what this module does.",
  "config.announcement.name": "Announcement",
  "config.announcement.description": "Message posted by the hello command."
}
`;

const I18N_FR = `{
  "modules.__ID__.name": "__NAME__",
  "modules.__ID__.description": "TODO: décrivez ce que fait ce module.",
  "config.announcement.name": "Annonce",
  "config.announcement.description": "Message posté par la commande hello."
}
`;

const MODEL_PRISMA = `// Database models for the __ID__ module.
// Uncomment and adapt the example below, then run:
//   pnpm prisma:generate && pnpm prisma:migrate
// Model names must be unique across ALL modules (everything is consolidated
// into a single schema).
//
// model __Pascal__Thing {
//   id        String   @id @default(cuid())
//   guildId   String
//   createdAt DateTime @default(now())
// }
`;

const TEST_TS = `import { describe, expect, it } from "vitest";
import { initTestI18n, makeTestConfig } from "#lib/testing.js";
import { __CAMEL__ConfigSchema } from "./__ID__.config.js";

describe("__ID__ config", () => {
  it("serves schema defaults without a DB", async () => {
    await initTestI18n();
    const config = makeTestConfig("__ID__", __CAMEL__ConfigSchema, {});

    expect(config.get("announcement")).toBe("Hello!");
    expect(config.isSet("announcement")).toBe(false);
  });
});
`;

async function main(): Promise<void> {
  const [id, ...nameParts] = process.argv.slice(2);

  if (!id || !/^[a-z0-9-]+$/.test(id)) {
    console.error("Usage: pnpm new-module <module-id> [Display Name]");
    console.error("  <module-id> must match /^[a-z0-9-]+$/ (e.g. my-module)");
    process.exit(1);
  }

  const name = nameParts.join(" ") || toPascal(id);
  const camel = toCamel(id);
  const pascal = toPascal(id);
  const fill = (template: string) =>
    template
      .replaceAll("__ID__", id)
      .replaceAll("__CAMEL__", camel)
      .replaceAll("__PASCAL__", pascal)
      .replaceAll("__NAME__", name);

  const dir = path.join(__dirname, "..", "src", "modules", id);
  try {
    await fs.stat(dir);
    console.error(`Refusing to overwrite existing directory: ${dir}`);
    process.exit(1);
  } catch {
    // Missing directory: the expected case, keep going.
  }

  const files: Record<string, string> = {
    [`${id}.module.ts`]: MODULE_TS,
    [`${id}.config.ts`]: CONFIG_TS,
    [`commands/hello.command.ts`]: COMMAND_TS,
    [`listeners/message.listener.ts`]: LISTENER_TS,
    [`i18n/en.json`]: I18N_EN,
    [`i18n/fr.json`]: I18N_FR,
    [`models/${id}.prisma`]: MODEL_PRISMA,
    [`${id}.test.ts`]: TEST_TS,
  };

  for (const [relative, template] of Object.entries(files)) {
    const fullPath = path.join(dir, relative);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, fill(template));
    console.log(`  created ${path.relative(process.cwd(), fullPath)}`);
  }

  console.log(`\nModule "${id}" scaffolded. Next steps:`);
  console.log(`  1. Fill the TODO description in ${id}.module.ts`);
  console.log(`  2. pnpm test:unit --project unit src/modules/${id}`);
  console.log(`  3. pnpm dev, then enable it via /modules on your dev guild`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
