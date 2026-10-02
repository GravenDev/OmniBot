import { DatabaseSync } from "node:sqlite";

const [databasePath] = process.argv.slice(2);
if (!databasePath) {
  console.error("Usage: tsx scripts/export-dj4h-rngdle.ts <path/to/dj4h.db>");
  process.exit(1);
}

function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

const database = new DatabaseSync(databasePath, { readOnly: true });

function readAll<Row>(sql: string): Row[] {
  const statement = database.prepare(sql);
  statement.setReadBigInts(true);
  return statement.all() as Row[];
}

const accounts = readAll<{
  guild_id: bigint;
  user_id: bigint;
  rng_username: string;
}>("SELECT guild_id, user_id, rng_username FROM rngdleuser");

const channels = readAll<{ guild_id: bigint; leaderboard_channel_id: bigint }>(
  "SELECT guild_id, leaderboard_channel_id FROM rngdleguildconfig WHERE leaderboard_channel_id IS NOT NULL"
);

const lines = ["BEGIN;"];

for (const account of accounts) {
  lines.push(
    `INSERT INTO "RngdleAccount" ("guildId", "userId", "username") VALUES (${literal(String(account.guild_id))}, ${literal(String(account.user_id))}, ${literal(account.rng_username)}) ON CONFLICT ("guildId", "userId") DO UPDATE SET "username" = EXCLUDED."username";`
  );
}

for (const channel of channels) {
  const guildId = literal(String(channel.guild_id));
  const setting = `jsonb_build_object('leaderboardChannel', ${literal(String(channel.leaderboard_channel_id))})`;
  lines.push(
    `INSERT INTO "GuildConfiguration" ("guildId", "data") VALUES (${guildId}, jsonb_build_object('rngdle', ${setting})) ON CONFLICT ("guildId") DO UPDATE SET "data" = "GuildConfiguration"."data" || jsonb_build_object('rngdle', COALESCE("GuildConfiguration"."data" -> 'rngdle', '{}'::jsonb) || ${setting});`
  );
}

lines.push("COMMIT;");
console.log(lines.join("\n"));
console.error(
  `Exported ${accounts.length} accounts and ${channels.length} leaderboard channels.`
);
