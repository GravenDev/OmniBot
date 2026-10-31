// Renders the images a preview file describes, on the working tree and, with
// --before, on another commit, so a change to an image can be shown side by side.
//
//   pnpm render-preview <file.preview.ts> [--before <ref>] [--out <dir>] [--only <name>]
//   pnpm render-preview --clean <worktree path>
//
// A preview file exports a record of named renderers, each returning a PNG:
//
//   export default { report: () => renderReportCard(data, labels) } satisfies Previews;
//
// (`Previews` comes from `#lib/preview.js`.)
//
// The "before" images come from a temporary worktree of <ref>, into which the
// current preview file (and #lib/preview) is copied: the same data is drawn by
// the old code, so the pair differs only by the change. Fields the old code
// does not know are ignored; a field it needs and the data lacks shows up as
// "undefined" or "NaN" in the image, so an entry drawing either fails (a
// narrow column can shorten it past recognition; real data containing such a
// word must be renamed).
//
// Output: the path of each image written, then `identical: <name>` for each
// pair that came out byte-equal; on stderr, `worktree: <path>` for the
// temporary worktree, which `--clean <path>` removes if a stopped run left
// it (and refuses any other folder). Relative arguments are resolved against
// the directory pnpm was called from; printed paths are absolute. Exit 0 when every entry drew on every side asked, 1 when one
// failed or nothing was drawn, 2 on a usage error.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createCanvas } from "@napi-rs/canvas";

type Previews = Record<string, () => Promise<Buffer>>;

export interface Options {
  file: string;
  before: string | null;
  out: string;
  only: string | null;
}

const USAGE =
  "usage: pnpm render-preview <file.preview.ts> [--before <ref>] [--out <dir>] [--only <name>]";

export function parseArgs(args: string[]): Options {
  const options: Options = {
    file: "",
    before: null,
    out: path.join(os.tmpdir(), "render-preview"),
    only: null,
  };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === "--before" || arg === "--out" || arg === "--only") {
      const value = args[++index];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} needs a value\n${USAGE}`);
      }
      options[arg.slice(2) as "before" | "out" | "only"] = value;
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown option ${arg}\n${USAGE}`);
    } else if (options.file) {
      throw new Error(`one preview file at a time\n${USAGE}`);
    } else {
      options.file = arg;
    }
  }
  if (!options.file) {
    throw new Error(USAGE);
  }
  if (!options.file.endsWith(".preview.ts")) {
    throw new Error(`${options.file} is not a .preview.ts file`);
  }
  return options;
}

export function outputName(name: string, side: "before" | "after"): string {
  return `${name.replace(/[^\w-]+/g, "-")}-${side}.png`;
}

const suspicious: string[] = [];

/** Records the drawn texts that betray a missing field. */
function watchDrawnText(): void {
  const prototype = Object.getPrototypeOf(
    createCanvas(1, 1).getContext("2d")
  ) as Record<
    "fillText" | "strokeText",
    (text: string, ...rest: number[]) => void
  >;
  for (const method of ["fillText", "strokeText"] as const) {
    const draw = prototype[method];
    prototype[method] = function (this: unknown, text, ...rest) {
      if (/\bundefined\b|\bNaN\b|\[object Object\]/.test(String(text))) {
        suspicious.push(String(text));
      }
      return draw.call(this, text, ...rest);
    };
  }
}

/**
 * Child mode: renders the previews of `file` into `out`, run inside the tree to
 * draw with. It writes to the streams directly: the bot's logger takes
 * console.log and console.error over once imported, and loses what it has not
 * flushed when the process exits.
 */
async function renderAll(
  file: string,
  out: string,
  side: "before" | "after",
  only: string | null
): Promise<boolean> {
  const previews = (await import(pathToFileURL(file).href)) as {
    default: Previews;
  };
  watchDrawnText();
  const names = Object.keys(previews.default).filter(
    (name) => only === null || name === only
  );
  if (names.length === 0) {
    process.stderr.write(
      only ? `no preview named ${only} in ${file}\n` : `no preview in ${file}\n`
    );
    return false;
  }
  fs.mkdirSync(out, { recursive: true });
  let ok = true;
  for (const name of names) {
    const target = path.join(out, outputName(name, side));
    // An image left by an earlier run must not pass for this one's.
    fs.rmSync(target, { force: true });
    try {
      suspicious.length = 0;
      const png = await previews.default[name]!();
      if (suspicious.length > 0) {
        throw new Error(
          `draws ${JSON.stringify(suspicious[0])}: the data lacks a field this code needs`
        );
      }
      fs.writeFileSync(target, png);
      process.stdout.write(`${target}\n`);
    } catch (err) {
      ok = false;
      process.stderr.write(
        `${side}: ${name} failed: ${(err as Error).message}\n`
      );
    }
  }
  return ok;
}

function render(
  root: string,
  script: string,
  file: string,
  options: Options,
  side: "before" | "after"
): Drawn {
  const args = [
    "--conditions=development",
    "--import",
    "tsx",
    script,
    "--render",
    file,
    options.out,
    side,
    ...(options.only ? [options.only] : []),
  ];
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: ["ignore", "pipe", "inherit"],
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "development" },
  });
  if (result.error) {
    throw result.error;
  }
  // The child prints the path of each image it wrote. A child that exits 0
  // without printing any (one that never reached main, say) has drawn nothing.
  const written = result.stdout
    .split(/\r?\n/)
    .filter((line) => line.endsWith(`-${side}.png`));
  for (const target of written) {
    console.log(target);
  }
  if (result.status === 0 && written.length === 0) {
    console.error(`${side}: nothing was drawn`);
  }
  // What did draw still counts when another entry failed: its pair can be
  // compared.
  return { written, ok: result.status === 0 && written.length > 0 };
}

interface Drawn {
  written: string[];
  ok: boolean;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function renderBefore(root: string, options: Options): Drawn {
  const ref = git(root, "rev-parse", "--verify", `${options.before}^{commit}`);
  const tree = fs.mkdtempSync(path.join(os.tmpdir(), "render-preview-"));
  // Named, so that a run stopped before its cleanup knows which leftover is
  // its own: other sessions may be drawing in theirs.
  console.error(`worktree: ${tree}`);
  // Ctrl-C reaches the child too, which stops; the cleanup below must still
  // run, or the temporary worktree outlives the run.
  const ignore = () => {};
  process.on("SIGINT", ignore).on("SIGTERM", ignore);
  try {
    git(root, "worktree", "add", "--detach", "--quiet", tree, ref);
    // The old tree has neither the dependencies nor, maybe, this script or the
    // preview file: link the former, copy the latter. A junction is what
    // Windows lets anyone create for a directory; elsewhere it is a symlink.
    for (const shared of ["node_modules", "src/generated"]) {
      if (fs.existsSync(path.join(root, shared))) {
        const link = path.join(tree, shared);
        fs.rmSync(link, { recursive: true, force: true });
        fs.symlinkSync(path.join(root, shared), link, "junction");
      }
    }
    // The preview file, and the helpers it imports, which older commits lack.
    const relative = path.relative(root, options.file);
    for (const file of [relative, path.join("src", "lib", "preview.ts")]) {
      fs.mkdirSync(path.dirname(path.join(tree, file)), { recursive: true });
      fs.copyFileSync(path.join(root, file), path.join(tree, file));
    }
    const script = path.join(tree, "scripts", "render-preview.ts");
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.copyFileSync(fileURLToPath(import.meta.url), script);
    return render(tree, script, path.join(tree, relative), options, "before");
  } finally {
    removeTree(root, tree);
    process.off("SIGINT", ignore).off("SIGTERM", ignore);
  }
}

/**
 * Removes a temporary worktree, links first: removing it must never reach
 * through a link into the real node_modules. Also what `--clean` runs on the
 * leftover of a stopped run.
 */
function removeTree(root: string, tree: string): void {
  for (const shared of ["node_modules", path.join("src", "generated")]) {
    const link = path.join(tree, shared);
    try {
      if (fs.lstatSync(link).isSymbolicLink()) {
        fs.unlinkSync(link);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new Error(
          `could not unlink ${link}, so ${tree} was left in place: ${(err as Error).message}`
        );
      }
    }
  }
  if (fs.existsSync(path.join(tree, ".git"))) {
    git(root, "worktree", "remove", "--force", tree);
  } else {
    // Stopped during `git worktree add`: a partial checkout, and maybe an
    // entry git can prune now that its folder is gone. Only when the entry is
    // there: prune drops every worktree whose folder is missing.
    // Looked up first: git lists the real path, found only while it exists.
    const entry = worktreeEntry(root, tree);
    fs.rmSync(tree, { recursive: true, force: true });
    if (entry !== null) {
      git(root, "worktree", "prune");
    }
  }
}

/**
 * A path as the file system stores it, to compare with the ones git prints:
 * git records real paths, with Windows short (8.3) names expanded, which only
 * the native realpath does; Windows paths compare without case.
 */
function canonical(file: string): string {
  const real = fs.realpathSync.native(file);
  return process.platform === "win32" ? real.toLowerCase() : real;
}

/** The `git worktree list --porcelain` block of `tree`, if git lists it. */
function worktreeEntry(root: string, tree: string): string | null {
  const real = fs.existsSync(tree) ? canonical(tree) : tree;
  const block = git(root, "worktree", "list", "--porcelain")
    .split(/\r?\n\r?\n/)
    .find((entry) => {
      const listed = /^worktree (.+)$/m.exec(entry)?.[1];
      return (
        listed !== undefined &&
        (listed === tree ||
          (fs.existsSync(listed) && canonical(listed) === real))
      );
    });
  return block ?? null;
}

function repositoryOf(file: string, given: string): string {
  try {
    return fs.realpathSync(
      execFileSync("git", ["rev-parse", "--show-toplevel"], {
        cwd: path.dirname(file),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim()
    );
  } catch {
    throw new Error(`${given} is outside the repository: no git tree holds it`);
  }
}

// What mkdtemp makes of the prefix: the only folders --clean will remove.
const TEMPORARY = /^render-preview-[A-Za-z0-9]{6}$/;

/**
 * Removes the temporary worktree a stopped run printed, and nothing else: a
 * detached worktree of this repository, directly in the temporary directory,
 * named as this script names them.
 */
function clean(tree: string): number {
  if (!path.isAbsolute(tree)) {
    throw new Error(
      `give the absolute path printed after "worktree:", not ${tree}`
    );
  }
  if (!fs.existsSync(tree)) {
    throw new Error(
      `${tree} does not exist; if git worktree list still names it, git worktree prune drops it, with every other worktree whose folder is missing`
    );
  }
  const real = canonical(tree);
  if (
    path.dirname(real) !== canonical(os.tmpdir()) ||
    !TEMPORARY.test(path.basename(real))
  ) {
    throw new Error(`${tree} is not a render-preview temporary worktree`);
  }
  const root = fs.realpathSync(
    git(process.cwd(), "rev-parse", "--show-toplevel")
  );
  const entry = worktreeEntry(root, real);
  if (entry === null || !/^detached$/m.test(entry)) {
    throw new Error(
      `${tree} is not a detached worktree of ${root}: left in place, check what it holds before deleting it by hand`
    );
  }
  removeTree(root, tree);
  console.log(`removed: ${tree}`);
  return 0;
}

/** The names of the pairs whose two images are byte-equal. */
export function identicalPairs(written: string[]): string[] {
  return written
    .filter((file) => file.endsWith("-before.png"))
    .filter((before) => {
      const after = before.replace(/-before\.png$/, "-after.png");
      return (
        written.includes(after) &&
        fs.readFileSync(before).equals(fs.readFileSync(after))
      );
    })
    .map((before) => path.basename(before).replace(/-before\.png$/, ""));
}

async function main(args: string[]): Promise<number> {
  if (args[0] === "--render") {
    const [, file, out, side, only] = args;
    return (await renderAll(
      file!,
      out!,
      side as "before" | "after",
      only ?? null
    ))
      ? 0
      : 1;
  }
  if (args[0] === "--clean") {
    if (!args[1] || args.length > 2) {
      throw new Error("usage: pnpm render-preview --clean <worktree path>");
    }
    return clean(args[1]);
  }
  const options = parseArgs(args);
  // pnpm runs scripts from the package root; INIT_CWD is where it was called,
  // when it is pnpm running this script (it may be left from an outer one).
  const cwd =
    process.env["npm_lifecycle_event"] === "render-preview"
      ? (process.env["INIT_CWD"] ?? process.cwd())
      : process.cwd();
  const given = options.file;
  options.file = path.resolve(cwd, options.file);
  options.out = path.resolve(cwd, options.out);
  if (!fs.existsSync(options.file)) {
    throw new Error(`${given} not found`);
  }
  options.file = fs.realpathSync(options.file);
  // The tree the file belongs to, not the one the command was typed in:
  // worktrees can sit inside another checkout.
  const root = repositoryOf(options.file, given);
  const relative = path.relative(root, options.file);
  if (
    path.isAbsolute(relative) ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`)
  ) {
    throw new Error(`${given} is outside the repository ${root}`);
  }
  const script = fileURLToPath(import.meta.url);
  const after = render(root, script, options.file, options, "after");
  const before =
    options.before === null
      ? { written: [], ok: true }
      : renderBefore(root, options);
  for (const name of identicalPairs([...after.written, ...before.written])) {
    console.log(`identical: ${name}`);
  }
  return after.ok && before.ok ? 0 : 1;
}

// Real paths: on macOS the temporary worktree sits under a symlinked tmpdir.
const invoked = process.argv[1] && fs.realpathSync(process.argv[1]);
if (invoked === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error((err as Error).message);
      process.exit(2);
    }
  );
}
