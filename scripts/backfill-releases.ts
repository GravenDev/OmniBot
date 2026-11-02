// Creates the GitHub Releases of the version tags that predate the release
// job of ci.yml, oldest first, with the same notes as that job.
//
//   node scripts/backfill-releases.ts [--out <dir>] [--only <tag,…>] [--ai]
//   node scripts/backfill-releases.ts --apply [--draft] [--update] [--only <tag,…>] [--ai]
//
// Without --apply (the default) it is a dry run: the notes of each tag are
// written to <out>/<tag>.md (default: a new private folder under $TMPDIR,
// printed), with what --apply would do to it; GitHub is only read
// (`gh release list`), never written.
//
// --apply creates the release of every tag that has none, with
// `gh release create --verify-tag`, which refuses to create a tag: tags are
// never touched. A tag that already has a release is skipped; with --update,
// a release whose notes are empty gets them (title, draft and prerelease
// state kept), and one that has any text — written by the release job of
// ci.yml or by hand — is never touched.
// --draft creates drafts, to review before publishing them by hand. A tag with
// a `-` is marked as a prerelease. Only the highest release is marked Latest,
// whatever the order of creation.
//
// --ai adds the summary written by an AI model (needs AI_API_KEY and AI_MODEL,
// AI_BASE_URL optional, as for scripts/release-notes.ts): one call per tag,
// at most 8000 output tokens each. Without it the backfill spends nothing.
// Needs git, git-cliff (.mise.toml) and, for --apply, an authenticated gh.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
// `.ts`, not `.js`: this script runs on plain Node (type stripping), which
// does not map one extension to the other.
import {
  aiSettings,
  buildNotes,
  DEFAULT_REPOSITORY,
  isPrerelease,
  listTags,
  sortTags,
  tagDate,
} from "./release-notes.ts";

export interface Options {
  apply: boolean;
  draft: boolean;
  update: boolean;
  ai: boolean;
  /** null: a new folder of the temporary directory. */
  out: string | null;
  only: string[] | null;
}

const USAGE =
  "usage: node scripts/backfill-releases.ts [--apply] [--draft] [--update] [--ai] [--out <dir>] [--only <tag,…>]";

export function parseArgs(args: string[]): Options {
  const options: Options = {
    apply: false,
    draft: false,
    update: false,
    ai: false,
    out: null,
    only: null,
  };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === "--out" || arg === "--only") {
      const value = args[++index];
      if (!value || value.startsWith("--"))
        throw new Error(`${arg} needs a value\n${USAGE}`);
      if (arg === "--out") options.out = value;
      else options.only = value.split(",").filter(Boolean);
    } else if (
      arg === "--apply" ||
      arg === "--draft" ||
      arg === "--update" ||
      arg === "--ai"
    ) {
      options[arg.slice(2) as "apply" | "draft" | "update" | "ai"] = true;
    } else {
      throw new Error(`unknown argument: ${arg}\n${USAGE}`);
    }
  }
  if ((options.draft || options.update) && !options.apply) {
    throw new Error(`--draft and --update go with --apply\n${USAGE}`);
  }
  return options;
}

export type Action = "create" | "update" | "skip";

/** Tag of each release, drafts included, and whether its notes hold text. */
export type Releases = Map<string, boolean>;

export function actionFor(
  tag: string,
  existing: Releases,
  update: boolean
): Action {
  if (!existing.has(tag)) return "create";
  return update && !existing.get(tag) ? "update" : "skip";
}

/** The release GitHub should show as Latest: the highest one, prereleases aside. */
export function latestRelease(tags: string[]): string | null {
  return (
    sortTags(tags)
      .filter((tag) => !isPrerelease(tag))
      .at(-1) ?? null
  );
}

export function createArgs(
  repository: string,
  tag: string,
  notesFile: string,
  options: { draft: boolean; latest: boolean }
): string[] {
  return [
    "release",
    "create",
    tag,
    "--repo",
    repository,
    "--verify-tag",
    "--title",
    tag,
    "--notes-file",
    notesFile,
    ...(isPrerelease(tag) ? ["--prerelease"] : []),
    ...(options.draft ? ["--draft"] : []),
    `--latest=${options.latest}`,
  ];
}

export function editArgs(
  repository: string,
  tag: string,
  notesFile: string
): string[] {
  return [
    "release",
    "edit",
    tag,
    "--repo",
    repository,
    "--notes-file",
    notesFile,
  ];
}

/** The releases of the repository; null when gh cannot tell. */
function existingReleases(repository: string): Releases | null {
  try {
    // `gh release list` has no body field: the API has, drafts included.
    const out = execFileSync(
      "gh",
      [
        "api",
        "--paginate",
        `repos/${repository}/releases?per_page=100`,
        "--jq",
        '.[] | [.tag_name, ((.body // "") | test("\\\\S"))] | @tsv',
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    return new Map(
      out
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [tag, text] = line.split("\t");
          return [tag!, text === "true"] as const;
        })
    );
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  let options: Options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(2);
  }
  const repository = process.env["GITHUB_REPOSITORY"] || DEFAULT_REPOSITORY;
  const allTags = listTags();
  const tags = sortTags(allTags).filter(
    (tag) => !options.only || options.only.includes(tag)
  );
  const unknown = (options.only ?? []).filter((tag) => !allTags.includes(tag));
  if (unknown.length > 0) {
    process.stderr.write(`unknown tags: ${unknown.join(", ")}\n`);
    process.exit(2);
  }
  const settings = aiSettings(process.env, !options.ai);
  if (options.ai && "skipped" in settings) {
    process.stderr.write(`--ai: ${settings.skipped}\n`);
    process.exit(2);
  }
  const ai = "ai" in settings ? settings.ai : null;

  const existing = existingReleases(repository);
  if (!existing && options.apply) {
    process.stderr.write(`cannot list the releases of ${repository} with gh\n`);
    process.exit(1);
  }
  const latest = latestRelease(allTags);
  // --apply publishes these files: a fixed name in a shared temporary
  // directory would let another account of the machine plant or edit them.
  const out =
    options.out ?? fs.mkdtempSync(path.join(os.tmpdir(), "release-notes-"));
  fs.mkdirSync(out, { recursive: true });

  console.log(
    `${options.apply ? "apply" : "dry run"}: ${tags.length} tags, notes in ${out}`
  );
  for (const tag of tags) {
    const action = existing
      ? actionFor(tag, existing, options.update)
      : "create?";
    // Nothing to publish: no notes to build, and no summary to pay for.
    if (options.apply && action === "skip") {
      console.log(`${tag.padEnd(14)}  skip`);
      continue;
    }
    const { notes, previous, images, summarized } = await buildNotes({
      githubRepository: repository,
      tags: allTags,
      tag,
      ai,
      taggedOn: tagDate(tag),
    });
    const file = path.join(out, `${tag}.md`);
    fs.writeFileSync(file, notes);
    const found = images.filter((image) => image.digest).length;
    const line = [
      tag.padEnd(14),
      `since ${previous ?? "root"}`.padEnd(20),
      `images ${found}/${images.length}`,
      summarized ? "summary" : "no summary",
      action,
    ].join("  ");
    console.log(line);
    if (!options.apply || action === "skip") continue;
    const args =
      action === "update"
        ? editArgs(repository, tag, file)
        : createArgs(repository, tag, file, {
            draft: options.draft,
            latest: tag === latest,
          });
    execFileSync("gh", args, { stdio: "inherit" });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
