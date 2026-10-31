// Renders the images a preview file describes, on the working tree and, with
// --before, on another commit, so a change to an image can be shown side by side.
//
//   pnpm render-preview <file.preview.ts> [--before <ref>] [--out <dir>] [--only <name>]
//
// A preview file exports a record of named renderers, each returning a PNG:
//
//   export default { report: () => renderReportCard(data, labels) } satisfies Previews;
//
// (`Previews` comes from `#lib/preview.js`.)
//
// The "before" images come from a temporary worktree of <ref>, into which the
// current preview file is copied: the same data is drawn by the old code, so
// the pair differs only by the change. Fields the old code does not know are
// ignored; a renderer the old code cannot run is reported, not fatal.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
    try {
      const png = await previews.default[name]!();
      const target = path.join(out, outputName(name, side));
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
): boolean {
  const args = [
    "--conditions=development",
    "--import",
    "tsx",
    script,
    "--render",
    file,
    path.resolve(options.out),
    side,
    ...(options.only ? [options.only] : []),
  ];
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: ["ignore", "pipe", "inherit"],
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "development" },
  });
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
  return result.status === 0 && written.length > 0;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function renderBefore(root: string, options: Options): boolean {
  const ref = git(root, "rev-parse", "--verify", `${options.before}^{commit}`);
  const tree = fs.mkdtempSync(path.join(os.tmpdir(), "render-preview-"));
  git(root, "worktree", "add", "--detach", "--quiet", tree, ref);
  const links: string[] = [];
  try {
    // The old tree has neither the dependencies nor, maybe, this script or the
    // preview file: link the former, copy the latter. A junction is what
    // Windows lets anyone create for a directory; elsewhere it is a symlink.
    for (const shared of ["node_modules", "src/generated"]) {
      if (fs.existsSync(path.join(root, shared))) {
        const link = path.join(tree, shared);
        fs.rmSync(link, { recursive: true, force: true });
        fs.symlinkSync(path.join(root, shared), link, "junction");
        links.push(link);
      }
    }
    // The preview file, and the helpers it imports, which older commits lack.
    const relative = path.relative(root, path.resolve(options.file));
    for (const file of [relative, path.join("src", "lib", "preview.ts")]) {
      fs.mkdirSync(path.dirname(path.join(tree, file)), { recursive: true });
      fs.copyFileSync(path.join(root, file), path.join(tree, file));
    }
    const script = path.join(tree, "scripts", "render-preview.ts");
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.copyFileSync(fileURLToPath(import.meta.url), script);
    return render(tree, script, path.join(tree, relative), options, "before");
  } finally {
    // Unlink first: removing the worktree must never reach through a link
    // into the real node_modules.
    for (const link of links) {
      fs.unlinkSync(link);
    }
    git(root, "worktree", "remove", "--force", tree);
  }
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
  const options = parseArgs(args);
  const root = git(process.cwd(), "rev-parse", "--show-toplevel");
  if (!fs.existsSync(path.resolve(options.file))) {
    throw new Error(`${options.file} not found`);
  }
  const script = fileURLToPath(import.meta.url);
  const after = render(
    root,
    script,
    path.resolve(options.file),
    options,
    "after"
  );
  const before = options.before === null || renderBefore(root, options);
  return after && before ? 0 : 1;
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
