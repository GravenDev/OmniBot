import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const RULE = "omnibot/no-whole-guild-member-fetch";

const REPORTED = [
  "await guild.members.fetch();",
  "await guild.members.fetch(undefined);",
  "await guild.members.fetch(null);",
  "await guild.members.fetch({ user: undefined });",
  "await guild.members.fetch({ query: ``, limit: 0 });",
  "await guild.members.fetch({ [user]: true });",
  "await guild.members.fetch({ query: undefined });",
  "await guild.members.fetch({ query: null, limit: undefined });",
  "await guild.members!.fetch();",
  "await (guild.members as any).fetch();",
  'await guild.members.fetch({ query: "", limit: 0 });',
  "await guild.members.fetch({ limit: 0 });",
  "await guild.members.fetch({ withPresences: true });",
  'await guild.members["fetch"]();',
  "await guild.members[`fetch`]();",
  "const { members } = guild; await members.fetch();",
  "await guild.members.list({ limit: 1000 });",
  "await client.rest.get(Routes.guildMembers(id));",
  "client.ws.send({ op: GatewayOpcodes.RequestGuildMembers, d: {} });",
  "client.ws.send({ op: 8, d: {} });",
  "await fetch(`https://discord.com/api/v10/guilds/${id}/members?limit=1000`);",
  "await fetch(`${api}/guilds/${id}/members${query}`);",
  'await fetch("https://discord.com/api/v10/guilds/123/members");',
];

const ALLOWED = [
  "await guild.members.fetch(id);",
  "await guild.members.fetch({ user: [id] });",
  'await guild.members.fetch({ query: "ab", limit: 10 });',
  "await guild.members.fetch({ query: name });",
  'await guild.members.fetch({ query: "", limit: 1 });',
  "await guild.members.fetch(options);",
  "await guild.members.fetch({ ...options });",
  "await thread.members.fetch({ member: id, force: true });",
  'await guild.members.search({ query: "a" });',
  "await client.rest.get(Routes.guildMember(id, id));",
  'const action = { op: 8, label: "x" };',
  "await fetch(`https://discord.com/api/v10/guilds/${id}/members/${id}`);",
];

/** Lines reported by the rule, linting every case at once. */
let reportedLines: Set<number>;

beforeAll(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omnibot-lint-"));
  try {
    const config = path.join(dir, "oxlintrc.json");
    fs.writeFileSync(
      config,
      JSON.stringify({
        plugins: [],
        jsPlugins: [path.join(root, "lint", "omnibot.js")],
        rules: { [RULE]: "error" },
      })
    );
    // Line 1 declares the names; case i sits on line i + 2.
    const file = path.join(dir, "probe.ts");
    fs.writeFileSync(
      file,
      [
        "declare const guild: any, client: any, thread: any, Routes: any, GatewayOpcodes: any, id: string, api: string, query: string, name: string, options: any, user: string;",
        ...REPORTED,
        ...ALLOWED,
      ].join("\n")
    );
    const { stdout } = spawnSync(
      path.join(root, "node_modules", ".bin", "oxlint"),
      ["-c", config, "--format", "json", file],
      { encoding: "utf8" }
    );
    const { diagnostics } = JSON.parse(stdout) as {
      diagnostics: { code: string; labels: { span: { line: number } }[] }[];
    };
    reportedLines = new Set(
      diagnostics
        .filter((d) => d.code === "omnibot(no-whole-guild-member-fetch)")
        .map((d) => d.labels[0]!.span.line)
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe(RULE, () => {
  it.each(REPORTED.map((statement, i) => [statement, i + 2] as const))(
    "reports %s",
    (_, line) => {
      expect(reportedLines.has(line)).toBe(true);
    }
  );

  it.each(
    ALLOWED.map((statement, i) => [statement, REPORTED.length + i + 2] as const)
  )("allows %s", (_, line) => {
    expect(reportedLines.has(line)).toBe(false);
  });
});
