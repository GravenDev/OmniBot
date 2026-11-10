import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(fileURLToPath(import.meta.url), "..", "..");

const MEMBER_FETCH_REPORTED = [
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

const MEMBER_FETCH_ALLOWED = [
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

const ROUTE_REPORTED = [
  "await client.rest.get(`/guilds/${id}/messages/search`, { query });",
  'await rest.post("/channels/123/messages", { body: {} });',
  "await interaction.client.rest.put(`/guilds/${id}/thing`);",
  "await (client.rest as any).delete(`/guilds/${id}`);",
  'await fetch("https://discord.com/api/v10/users/@me");',
  "await fetch(`https://discordapp.com/api/guilds/${id}`);",
  'await rest.get("/guilds/1/x" as any);',
  "await rest.get(`/guilds/${id}/x` as `/${string}`);",
  'await client.rest.get(Routes.guild(id) + "/messages/search");',
  'await client.rest.get("/guilds/" + id + "/messages/search");',
  "await client.rest.get(`${Routes.guild(id)}/messages/search`);",
  "await client.rest.request({ method: 1, fullRoute: `/guilds/${id}/x` });",
  "await client.rest.raw({ fullRoute: `/guilds/${id}/x` });",
  "await client.rest.queueRequest({ fullRoute: Routes.guild(id) });",
  'await fetch("https://discord.com/api?x=1");',
  "await client.rest.get(Routes.guildMessagesSearch(id), { query });",
  "await client.rest.get(`${Routes.guildMessagesSearch(id)}`);",
  'await client.rest.get(Routes.guildMessagesSearch(id) + "?" + query);',
  "await new REST().setToken(token).get(Routes.currentApplication());",
  "await client.rest.request({ method: 1, fullRoute: Routes.guild(id) });",
  "await client.rest.post(Routes.channelMessages(id), { body: {} });",
  "await fetch(`${RouteBases.api}/guilds/${id}/messages/search`);",
  "const searchRoute = Routes.guildMessagesSearch(id);",
  "await client.rest.get(`${RouteBases.api}/guilds/${id}`);",
  "await client.rest.get(String(Routes.guild(id)));",
  "await fetch(`https://discord.com/api/v10/webhooks/${id}`, options);",
  'await fetch("https://discord.com/api/webhooks/1/abc/messages/2");',
  "await fetch(`https://discord.com/api/webhooks/${id}/${token}/messages/@original`);",
  "await client.rest.get(`https://discord.com/api/v10${Routes.guild(id)}`);",
  "await fetch(`https://Discord.com/api/v10/guilds/${id}`);",
];

const ROUTE_ALLOWED = [
  "await rest.put(route, { body });",
  "await guild.members.fetch(id);",
  "await fetch(`https://rngdle.com/api/users/${name}/rolls`);",
  "const link = `https://discord.com/channels/${id}/${id}/${id}`;",
  "store.get(`/guilds/${id}`);",
  'this.rest.delete("key");',
  'config.rest.get("timeout");',
  "const label = `${format(id)}/${id}`;",
  "await client.rest.get(`/${format(id)}`.slice(1) as never);",
  "cache.rest.get(`${id}`);",
  'const hook = "https://discord.com/api/webhooks/1/abc";',
  'const versioned = "https://discord.com/api/v10/webhooks/1/abc";',
  "const hookUrl = `https://discord.com/api/v${id}/webhooks/${id}/${token}`;",
  'const hookQuery = "https://discord.com/api/webhooks/1/abc-_9?wait=true";',
  'const other = "https://notdiscord.com/api/x";',
  'type Api = "https://discord.com/api/v10";',
];

const DECLARATIONS =
  "declare const guild: any, client: any, interaction: any, rest: any, store: any, config: any, cache: any, thread: any, Routes: any, RouteBases: any, format: any, REST: any, token: string, GatewayOpcodes: any, id: string, api: string, query: string, name: string, options: any, user: string, route: string;";

/**
 * How many times `rule` reports each line, linting every case at once: case i
 * sits on line i + 2.
 */
function reportedLines(rule: string, cases: string[]): Map<number, number> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omnibot-lint-"));
  try {
    const config = path.join(dir, "oxlintrc.json");
    fs.writeFileSync(
      config,
      JSON.stringify({
        plugins: [],
        jsPlugins: [path.join(root, "lint", "omnibot.js")],
        rules: { [`omnibot/${rule}`]: "error" },
      })
    );
    const file = path.join(dir, "probe.ts");
    fs.writeFileSync(file, [DECLARATIONS, ...cases].join("\n"));
    const { stdout } = spawnSync(
      path.join(root, "node_modules", ".bin", "oxlint"),
      ["-c", config, "--format", "json", file],
      { encoding: "utf8" }
    );
    const { diagnostics } = JSON.parse(stdout) as {
      diagnostics: { code: string; labels: { span: { line: number } }[] }[];
    };
    const lines = new Map<number, number>();
    for (const d of diagnostics) {
      if (d.code === `omnibot(${rule})`) {
        const line = d.labels[0]!.span.line;
        lines.set(line, (lines.get(line) ?? 0) + 1);
      }
    }
    return lines;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe.each([
  ["no-whole-guild-member-fetch", MEMBER_FETCH_REPORTED, MEMBER_FETCH_ALLOWED],
  ["discord-rest-in-polyfills", ROUTE_REPORTED, ROUTE_ALLOWED],
] as const)("omnibot/%s", (rule, reported, allowed) => {
  let lines: Map<number, number>;
  beforeAll(() => {
    lines = reportedLines(rule, [...reported, ...allowed]);
  });

  it.each(reported.map((statement, i) => [statement, i + 2] as const))(
    "reports %s, once",
    (_, line) => {
      expect(lines.get(line)).toBe(1);
    }
  );

  it.each(
    allowed.map((statement, i) => [statement, reported.length + i + 2] as const)
  )("allows %s", (_, line) => {
    expect(lines.has(line)).toBe(false);
  });
});
