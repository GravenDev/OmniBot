import { describe, expect, it, vi } from "vitest";
import {
  aiSettings,
  assembleNotes,
  buildRequest,
  escapeHtml,
  explainingParagraph,
  compareTags,
  extractJson,
  fixedAdvisories,
  imageRefs,
  imagesSection,
  lookupDigest,
  moduleGlossary,
  neutralizeMentions,
  parseArgs,
  parseLockfile,
  parseScan,
  parseSummary,
  previousTag,
  productionPackages,
  securityFixes,
  securityInput,
  securitySection,
  sortTags,
  summaryInput,
  unknownCommands,
  writeSummary,
  type FixedAdvisory,
  type ImageRef,
} from "./release-notes.js";
import { captureOutput } from "./test-support.js";

const TAGS = [
  "v0.6.1-rc.10",
  "v0.1.0",
  "v0.6.0",
  "v0.7.0",
  "v0.6.1-rc.2",
  "v0.1.0-rc1",
  "v0.6.1-rc.1",
  "vendor-freeze",
];

describe("tags", () => {
  it("sorts by semver precedence and drops what is not a version", () => {
    expect(sortTags(TAGS)).toEqual([
      "v0.1.0-rc1",
      "v0.1.0",
      "v0.6.0",
      "v0.6.1-rc.1",
      "v0.6.1-rc.2",
      "v0.6.1-rc.10",
      "v0.7.0",
    ]);
  });

  it("puts a prerelease before its release", () => {
    expect(compareTags("v1.0.0-rc.1", "v1.0.0")).toBeLessThan(0);
    expect(compareTags("v1.0.0-alpha", "v1.0.0-alpha.1")).toBeLessThan(0);
    expect(compareTags("v1.0.0-1", "v1.0.0-alpha")).toBeLessThan(0);
  });

  it("counts a release from the previous release, skipping prereleases", () => {
    expect(previousTag(TAGS, "v0.7.0")).toBe("v0.6.0");
  });

  it("counts a prerelease from the previous tag of any kind", () => {
    expect(previousTag(TAGS, "v0.6.1-rc.2")).toBe("v0.6.1-rc.1");
    expect(previousTag(TAGS, "v0.6.1-rc.1")).toBe("v0.6.0");
  });

  it("has nothing before the first tag", () => {
    expect(previousTag(TAGS, "v0.1.0-rc1")).toBeNull();
    expect(previousTag(TAGS, "v0.1.0")).toBeNull();
  });
});

describe("parseArgs", () => {
  it("reads the tag, the output and --no-ai", () => {
    expect(
      parseArgs(["--tag", "v1.2.3", "--out", "notes.md", "--no-ai"])
    ).toEqual({
      tag: "v1.2.3",
      out: "notes.md",
      ai: false,
    });
  });

  it("refuses a missing or malformed tag", () => {
    expect(() => parseArgs([])).toThrow(/--tag/);
    expect(() => parseArgs(["--tag", "v1.2"])).toThrow(/--tag/);
    expect(() => parseArgs(["--tag", "--out"])).toThrow(/needs a value/);
  });
});

describe("aiSettings", () => {
  it("skips without a key, a model or with --no-ai, and says why", () => {
    expect(aiSettings({ AI_API_KEY: "k", AI_MODEL: "m" }, true)).toEqual({
      skipped: "--no-ai",
    });
    expect(aiSettings({ AI_MODEL: "m" }, false)).toEqual({
      skipped: "no AI_API_KEY",
    });
    expect(aiSettings({ AI_API_KEY: "k", AI_MODEL: " " }, false)).toEqual({
      skipped: "no AI_MODEL",
    });
  });

  it("defaults the base URL to OpenAI's and takes another", () => {
    expect(aiSettings({ AI_API_KEY: "k", AI_MODEL: "m" }, false)).toEqual({
      ai: { apiKey: "k", model: "m", baseUrl: "https://api.openai.com/v1" },
    });
    expect(
      aiSettings(
        {
          AI_API_KEY: "k",
          AI_MODEL: "m",
          AI_BASE_URL: "https://api.mistral.ai/v1",
        },
        false
      )
    ).toEqual({
      ai: { apiKey: "k", model: "m", baseUrl: "https://api.mistral.ai/v1" },
    });
  });
});

describe("neutralizeMentions", () => {
  it("puts a mention in a code span", () => {
    expect(neutralizeMentions("messages en @silent.")).toBe(
      "messages en `@silent`."
    );
    expect(neutralizeMentions("@napi-rs/canvas v2")).toBe(
      "`@napi-rs/canvas` v2"
    );
  });

  it("leaves code spans and e-mail addresses alone", () => {
    expect(neutralizeMentions("`@here` et a@b.fr")).toBe("`@here` et a@b.fr");
  });
});

describe("summary checks", () => {
  const technical = "- **four-hour-game** : Pagination de /jd4h leaderboard";

  it("spots a command the changelog does not name", () => {
    expect(
      unknownCommands("`/jd4h leaderboard` et `/jd4h stats`", technical)
    ).toEqual([]);
    expect(unknownCommands("`/birthday set`", technical)).toEqual([
      "/birthday",
    ]);
    expect(unknownCommands("`/jd` et /commit", technical)).toEqual([
      "/jd",
      "/commit",
    ]);
  });

  it("spots a command written without backticks, not a path", () => {
    expect(unknownCommands("- nouvelle commande /ban", technical)).toEqual([
      "/ban",
    ]);
    expect(unknownCommands("(/ban) et « /kick »", technical)).toEqual([
      "/ban",
      "/kick",
    ]);
    expect(unknownCommands("le fichier src/modules et a/b", technical)).toEqual(
      []
    );
  });

  it("rejects a summary that holds a link", () => {
    for (const fr of [
      "- voir [ici](https://example.com)",
      "- voir https://example.com",
      "- voir www.example.com",
      "- voir [ici][1]",
      "- voir\n[1]: //example.com",
    ]) {
      expect(
        parseSummary(JSON.stringify({ visible: true, fr, en: "x" }), technical)
      ).toBeNull();
    }
    expect(
      parseSummary(
        JSON.stringify({ visible: true, fr: "a", en: "see http://x.y" }),
        technical
      )
    ).toBeNull();
  });

  it("accepts a well-formed answer and cleans it", () => {
    const answer = JSON.stringify({
      visible: true,
      fr: "- ` /jd4h leaderboard` se pagine <enfin>, `<date>` et merci @someone",
      en: "### 4h Game\n- `/jd4h leaderboard` is paginated\n### General\n- b",
    });
    expect(parseSummary(answer, technical)).toEqual({
      visible: true,
      fr: "- `/jd4h leaderboard` se pagine &lt;enfin&gt;, `<date>` et merci `@someone`",
      en: "### 4h Game\n- `/jd4h leaderboard` is paginated\n\n### General\n- b",
    });
  });

  it("finds the JSON inside a code fence or prose", () => {
    const object = '{"visible": false, "fr": "a", "en": "b"}';
    expect(extractJson("```json\n" + object + "\n```")).toBe(object);
    expect(extractJson("Voici :\n" + object + "\nVoilà.")).toBe(object);
    expect(parseSummary("```\n" + object + "\n```", "")).toEqual({
      visible: false,
      fr: "a",
      en: "b",
    });
  });

  it("rejects malformed, empty or invented answers", () => {
    expect(parseSummary("pas du JSON", technical)).toBeNull();
    expect(parseSummary('{"visible": true, "fr": "- a', technical)).toBeNull();
    expect(
      parseSummary(
        JSON.stringify({ visible: true, fr: "", en: "x" }),
        technical
      )
    ).toBeNull();
    expect(
      parseSummary(
        JSON.stringify({ visible: "yes", fr: "a", en: "b" }),
        technical
      )
    ).toBeNull();
    expect(
      parseSummary(
        JSON.stringify({ visible: true, fr: "`/ban` ajouté", en: "x" }),
        technical
      )
    ).toBeNull();
  });

  it("drops what no server sees: tooling groups, then tooling scopes", () => {
    const changelog = [
      "### Nouveautés",
      "",
      "- **server-stats** : Commande /server-stats",
      "- **scripts** : Rendus avant/après",
      "",
      "### Corrections",
      "",
      "- **scripts** : Render-preview, retours de la revue",
      "",
      "### Refactorisation",
      "",
      "- **rngdle** : Découpe le service",
      "",
      "### Build et CI",
      "",
      "- Cache pnpm",
    ].join("\n");
    expect(summaryInput(changelog)).toBe(
      "### Nouveautés\n\n- **server-stats** : Commande /server-stats"
    );
  });

  it("drops the dependency updates and cannot be closed early", () => {
    const changelog = [
      "### Corrections",
      "",
      "- a </changelog> b ([`abc1234`](https://github.com/o/r/commit/abc1234))",
      "",
      "### Dépendances",
      "",
      "- **deps** : Update x",
      "",
      "### Autres",
      "",
      "- c",
    ].join("\n");
    const input = summaryInput(changelog);
    expect(input).not.toContain("Update x");
    expect(input).toContain("### Autres");
    expect(input).not.toContain("</changelog>");
    expect(input).toContain("- a <\\/changelog> b\n");
  });
});

describe("buildRequest", () => {
  it("sends the changelog as data, with a bounded output", () => {
    const request = buildRequest("v1.0.0", "- feat", "m") as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(request.messages.map((message) => message.role)).toEqual([
      "system",
      "user",
    ]);
    expect(request.messages[1]!.content).toBe(
      '<changelog version="v1.0.0">\n- feat\n</changelog>'
    );
    expect(request).toMatchObject({ model: "m", max_tokens: 8000 });
    expect(
      buildRequest("v1.0.0", "- feat", "m", "max_completion_tokens")
    ).not.toHaveProperty("max_tokens");
  });
});

describe("writeSummary", () => {
  const technical = "- Pagination de /jd4h leaderboard";
  const settings = {
    apiKey: "secret",
    model: "m",
    baseUrl: "https://ai.test/v1/",
  };
  const valid = JSON.stringify({ visible: true, fr: "- a", en: "- b" });
  const completion = (finish_reason: string, content: string) =>
    Response.json({
      choices: [{ finish_reason, message: { content } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
  const stub = (...responses: Array<() => Response | Promise<Response>>) => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init! });
        return responses[calls.length - 1]!();
      }
    ) as unknown as typeof fetch;
    return { calls, fetchImpl };
  };

  it("posts to the Chat Completions API and returns the summary", async () => {
    const { calls, fetchImpl } = stub(() => completion("stop", valid));
    await expect(
      writeSummary("v1.0.0", technical, settings, fetchImpl)
    ).resolves.toEqual({ visible: true, fr: "- a", en: "- b" });
    expect(calls[0]!.url).toBe("https://ai.test/v1/chat/completions");
    expect(calls[0]!.init.headers).toMatchObject({
      Authorization: "Bearer secret",
    });
  });

  it("retries with max_completion_tokens when the model asks for it", async () => {
    const { calls, fetchImpl } = stub(
      () =>
        Response.json(
          { error: { message: "Use 'max_completion_tokens' instead." } },
          { status: 400 }
        ),
      () => completion("stop", valid)
    );
    await expect(
      writeSummary("v1.0.0", technical, settings, fetchImpl)
    ).resolves.not.toBeNull();
    expect(JSON.parse(String(calls[1]!.init.body))).toHaveProperty(
      "max_completion_tokens",
      8000
    );
  });

  it("takes no command from an advisory's title", async () => {
    const { fetchImpl } = stub(() =>
      completion(
        "stop",
        JSON.stringify({ visible: true, fr: "- `/files` corrigé", en: "- b" })
      )
    );
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    await expect(
      writeSummary("v1.0.0", technical, settings, fetchImpl, {
        security: "- a 1.0.0 → 1.1.0 : Path traversal in /files handler",
      })
    ).resolves.toBeNull();
    spy.mockRestore();
  });

  it("gives up on an HTTP error, a truncated answer, bad JSON or a timeout", async () => {
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    for (const response of [
      () => Response.json({ error: { message: "bad key" } }, { status: 401 }),
      () => new Response("upstream down", { status: 503 }),
      () => completion("length", valid),
      () => completion("stop", '{"visible": true, "fr": "- a'),
      () =>
        completion(
          "stop",
          JSON.stringify({ visible: true, fr: "`/ban`", en: "x" })
        ),
      () => {
        throw new DOMException("The operation timed out.", "TimeoutError");
      },
    ]) {
      const { fetchImpl } = stub(response);
      await expect(
        writeSummary("v1.0.0", technical, settings, fetchImpl)
      ).resolves.toBeNull();
    }
    expect(stderr.mock.calls.join("")).not.toContain("secret");
    vi.restoreAllMocks();
  });
});

describe("images", () => {
  const digest = `sha256:${"a".repeat(64)}`;
  const fakeFetch = (found: string[]) =>
    vi.fn(async (url: string | URL | Request) => {
      const href = String(url);
      if (href.includes("/token")) return Response.json({ token: "t" });
      const ok = found.some((path) => href.endsWith(path));
      return new Response(null, {
        status: ok ? 200 : 404,
        headers: ok ? { "docker-content-digest": digest } : {},
      });
    }) as unknown as typeof fetch;

  it("reads the digest of a tag", async () => {
    await expect(
      lookupDigest(
        "ghcr.io/gravendev/omnibot",
        "1.0.0",
        fakeFetch(["omnibot/manifests/1.0.0"])
      )
    ).resolves.toBe(digest);
  });

  it("names the images in lower case, without the v", async () => {
    const refs = await imageRefs(
      "GravenDev/OmniBot",
      "v1.0.0",
      fakeFetch(["/omnibot/manifests/1.0.0"])
    );
    expect(refs.map((ref) => [ref.repository, ref.tag, ref.digest])).toEqual([
      ["ghcr.io/gravendev/omnibot", "1.0.0", digest],
      ["ghcr.io/gravendev/omnibot-migrator", "1.0.0", null],
    ]);
  });

  it("is null when the registry cannot be reached", async () => {
    const failing = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    await expect(
      lookupDigest("ghcr.io/a/b", "1.0.0", failing)
    ).resolves.toBeNull();
  });

  it("pins found images by digest and says which are missing", () => {
    const section = imagesSection("GravenDev/OmniBot", [
      {
        name: "omnibot",
        label: "Bot",
        repository: "ghcr.io/g/omnibot",
        tag: "1.0.0",
        digest,
      },
      {
        name: "omnibot-migrator",
        label: "Migrations",
        repository: "ghcr.io/g/omnibot-migrator",
        tag: "1.0.0",
        digest: null,
      },
    ]);
    expect(section).toContain(`\`ghcr.io/g/omnibot:1.0.0@${digest}\``);
    expect(section).toContain(
      "`ghcr.io/g/omnibot-migrator:1.0.0` — introuvable sur GHCR"
    );
    expect(section).toContain(`docker pull ghcr.io/g/omnibot:1.0.0@${digest}`);
    expect(section).not.toContain("docker pull ghcr.io/g/omnibot-migrator");
  });
});

describe("assembleNotes", () => {
  const images: ImageRef[] = [];

  it("puts the summary first, then security, and the technical changelog last", () => {
    const notes = assembleNotes({
      githubRepository: "GravenDev/OmniBot",
      tag: "v1.1.0",
      previous: "v1.0.0",
      technical: "### Nouveautés\n\n- x",
      images,
      summary: { visible: true, fr: "- a", en: "- b" },
      security: [
        {
          name: "undici",
          from: ["7.1.0"],
          to: ["7.2.0"],
          production: true,
          advisory: {
            ids: ["GHSA-aaaa-bbbb-cccc"],
            summary: "s",
            severity: null,
          },
        },
      ],
    });
    const order = [
      "## Quoi de neuf",
      "## Sécurité",
      "## Images Docker",
      "## Changelog technique",
    ].map((title) => notes.indexOf(title));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order[0]).toBe(0);
    expect(notes).toContain("compare/v1.0.0...v1.1.0");
    expect(notes).toContain("> Résumé rédigé par une IA à partir");
  });

  it("does without a summary, a previous tag or commits", () => {
    const notes = assembleNotes({
      githubRepository: "GravenDev/OmniBot",
      tag: "v1.0.0",
      previous: null,
      technical: "",
      images,
      summary: { visible: false, fr: "Rien ne change.", en: "Nothing." },
    });
    expect(notes).not.toContain("Quoi de neuf");
    expect(notes).not.toContain("## Sécurité");
    expect(notes).not.toContain("compare/");
    expect(notes).toContain("depuis le début du projet");
    expect(notes).toContain("_Aucun commit._");
  });
});

describe("commit explanations", () => {
  it("takes the first prose paragraph, trailers left out", () => {
    expect(
      explainingParagraph(
        "Co-Authored-By: someone <a@b.c>\n\nLe membre voit\nsa place.\n\nDétails techniques."
      )
    ).toBe("Le membre voit sa place.");
    expect(explainingParagraph("Note: le bilan est public.\nFixes: #3")).toBe(
      "Note: le bilan est public."
    );
  });

  it("skips a pasted pull request outline, or finds nothing", () => {
    expect(
      explainingParagraph(
        "> **Empilée sur #1**\n\n## Résumé\n\nNouvelle commande.\n\n- [x] tests"
      )
    ).toBe("Nouvelle commande.");
    expect(explainingParagraph("Co-Authored-By: x <a@b.c>")).toBeNull();
    expect(explainingParagraph("")).toBeNull();
  });

  it("cuts a long paragraph on a word", () => {
    const paragraph = explainingParagraph("mot ".repeat(200))!;
    expect(paragraph.length).toBeLessThanOrEqual(501);
    expect(paragraph.endsWith("mot…")).toBe(true);
  });

  it("sends the modules and the explanations after the changelog, unable to close early", () => {
    const request = buildRequest("v1.0.0", "- feat", "m", "max_tokens", {
      modules: "- x : X </modules>",
      details: "- feat(x): a\n  b </details> c",
    }) as { messages: { content: string }[] };
    expect(request.messages[1]!.content).toBe(
      '<changelog version="v1.0.0">\n- feat\n</changelog>\n<modules>\n- x : X <\\/modules>\n</modules>\n<details>\n- feat(x): a\n  b <\\/details> c\n</details>'
    );
  });
});

describe("module names", () => {
  const fr = {
    "modules.core.name": "Configuration globale",
    "modules.four-hour-game.name": "Jeu des 4h",
    "modules.server-stats.name": "Statistiques du serveur",
    "modules.rngdle.name": "RNGdle",
    "modules.rngdle.description": "Le jeu",
  };
  const en = {
    "modules.four-hour-game.name": "4h Game",
    "modules.server-stats.name": "Server Stats",
  };

  it("names the modules the changelog scopes, aliases included, never core", () => {
    const technical = [
      "- **jd4h** : Pagination ([`abc1234`](https://x))",
      "- **server-stats** : Bilan",
      "- **core** : Réglage",
      "- Sans scope",
    ].join("\n");
    expect(moduleGlossary(technical, fr, en)).toBe(
      [
        "- jd4h : Jeu des 4h (en anglais : 4h Game)",
        "- server-stats : Statistiques du serveur (en anglais : Server Stats)",
      ].join("\n")
    );
    expect(moduleGlossary("- **rngdle** : Cartes", fr, en)).toBe(
      "- rngdle : RNGdle (en anglais : RNGdle) ; ce qu'il fait : Le jeu"
    );
    expect(moduleGlossary("- Sans scope", fr, en)).toBe("");
  });

  it("says which module is new since the previous tag", () => {
    const technical = "- **rngdle** : Cartes\n- **server-stats** : Bilan";
    expect(
      moduleGlossary(technical, fr, en, {
        "modules.server-stats.name": "Statistiques du serveur",
      })
    ).toBe(
      [
        "- server-stats : Statistiques du serveur (en anglais : Server Stats)",
        "- rngdle : RNGdle (en anglais : RNGdle) ; nouveau dans cette version ; ce qu'il fait : Le jeu",
      ].join("\n")
    );
  });
});

describe("escapeHtml", () => {
  it("escapes outside code spans only and trims their edges", () => {
    expect(escapeHtml("a <b> ` /cmd <date> ` c")).toBe(
      "a &lt;b&gt; `/cmd <date>` c"
    );
  });
});

// A pnpm lockfile cut down to what the script reads: two YAML documents (the
// first holds pnpm itself, as pnpm 11 and later write it), the importers and
// the snapshots.
const LOCKFILE = `---
lockfileVersion: '9.0'

importers:

  .:
    packageManagerDependencies:
      pnpm:
        specifier: 12.17.0
        version: 12.17.0

snapshots:

  pnpm@12.17.0: {}

---
lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      '@scope/app':
        specifier: ^1.0.0
        version: 1.0.0(peer@3.0.0)
    devDependencies:
      tool:
        specifier: 'catalog:'
        version: 5.0.0

  docs/site:
    dependencies:
      site:
        specifier: ^2.0.0
        version: 2.0.0

packages:

  '@scope/app@1.0.0':
    resolution: {integrity: sha512-x}

snapshots:

  '@scope/app@1.0.0(peer@3.0.0)':
    dependencies:
      lib: 2.0.0
      alias: real@4.0.0
    optionalDependencies:
      peer: 3.0.0
    transitivePeerDependencies:
      - other

  lib@2.0.0: {}

  real@4.0.0: {}

  peer@3.0.0: {}

  tarball@https://example.test/t.tgz:
    dependencies:
      lib: 1.0.0

  tool@5.0.0:
    dependencies:
      lib: 1.0.0

  lib@1.0.0: {}

  site@2.0.0: {}
`;

describe("lockfile", () => {
  it("reads the importers and the snapshots of every document", () => {
    const lock = parseLockfile(LOCKFILE);
    expect(lock.importers["."]).toMatchObject({
      dependencies: { "@scope/app": "1.0.0(peer@3.0.0)" },
      devDependencies: { tool: "5.0.0" },
      packageManagerDependencies: { pnpm: "12.17.0" },
    });
    expect(lock.importers["docs/site"]).toEqual({
      dependencies: { site: "2.0.0" },
    });
    expect(lock.snapshots["@scope/app@1.0.0(peer@3.0.0)"]).toEqual({
      lib: "2.0.0",
      alias: "real@4.0.0",
      peer: "3.0.0",
    });
    expect(lock.snapshots["lib@2.0.0"]).toEqual({});
    // A key holding a colon, unquoted: its dependencies stay its own.
    expect(lock.snapshots["peer@3.0.0"]).toEqual({});
    expect(lock.snapshots["tarball@https://example.test/t.tgz"]).toEqual({
      lib: "1.0.0",
    });
  });

  it("follows what the images ship, not the tooling nor the docs", () => {
    expect([...productionPackages(parseLockfile(LOCKFILE))].sort()).toEqual([
      "@scope/app@1.0.0",
      "lib@2.0.0",
      "peer@3.0.0",
      "real@4.0.0",
    ]);
  });
});

/** What osv-scanner --all-packages --format json prints, cut down. */
function osvOutput(
  packages: Array<[name: string, version: string, ...ids: string[][]]>
): unknown {
  return {
    results: [
      {
        source: { path: "/tmp/x/pnpm-lock.yaml", type: "lockfile" },
        packages: packages.map(([name, version, ...groups]) => ({
          package: { name, version, ecosystem: "npm" },
          ...(groups.length > 0
            ? {
                vulnerabilities: groups.map((ids) => ({
                  id: ids[0],
                  aliases: ids.slice(1),
                  summary: `Faille de ${name}`,
                  database_specific: { severity: "HIGH" },
                })),
                groups: groups.map((ids) => ({ ids: [ids[0]], aliases: ids })),
              }
            : {}),
        })),
      },
    ],
  };
}

describe("security fixes", () => {
  const FIXED = ["GHSA-fix0-0000-0000", "CVE-2099-0001", "PYSEC-2099-1"];
  const KEPT = ["GHSA-kept-0000-0000"];
  const NEW = ["GHSA-new0-0000-0000"];

  it("reads every package of a scan, advisories grouped with their aliases", () => {
    expect(
      parseScan(
        osvOutput([
          ["a", "1.0.0", FIXED],
          ["b", "2.0.0"],
        ])
      )
    ).toEqual([
      {
        name: "a",
        version: "1.0.0",
        advisories: [
          {
            ids: ["GHSA-fix0-0000-0000", "CVE-2099-0001", "PYSEC-2099-1"],
            summary: "Faille de a",
            severity: "HIGH",
          },
        ],
      },
      { name: "b", version: "2.0.0", advisories: [] },
    ]);
    expect(() => parseScan({ nothing: true })).toThrow();
  });

  it("lists an advisory gone after the release, with the versions it moved between", () => {
    const before = parseScan(
      osvOutput([
        ["a", "1.0.0", FIXED, KEPT],
        ["b", "1.0.0"],
      ])
    );
    const after = parseScan(
      osvOutput([
        ["a", "1.1.0", KEPT],
        ["b", "1.0.0"],
      ])
    );
    expect(fixedAdvisories(before, after, new Set(["a@1.0.0"]))).toEqual([
      {
        name: "a",
        from: ["1.0.0"],
        to: ["1.1.0"],
        production: true,
        advisory: {
          ids: FIXED,
          summary: "Faille de a",
          severity: "HIGH",
        },
      },
    ]);
  });

  it("never lists an advisory still there, or new in the release", () => {
    const before = parseScan(
      osvOutput([
        ["a", "1.0.0", KEPT],
        ["b", "1.0.0"],
      ])
    );
    const after = parseScan(
      osvOutput([
        ["a", "1.0.1", KEPT],
        ["b", "2.0.0", NEW],
      ])
    );
    expect(fixedAdvisories(before, after, new Set())).toEqual([]);
  });

  it("never lists an advisory still there against another package", () => {
    const before = parseScan(
      osvOutput([
        ["a", "1.0.0", FIXED],
        ["b", "1.0.0", FIXED],
      ])
    );
    const after = parseScan(
      osvOutput([
        ["a", "1.1.0"],
        ["b", "1.0.0", FIXED],
      ])
    );
    expect(fixedAdvisories(before, after, new Set())).toEqual([]);
  });

  it("says when the package is gone, and keeps a package's versions apart", () => {
    const before = parseScan(
      osvOutput([
        ["gone", "1.0.0", FIXED],
        ["gone", "1.0.0-rc.1", FIXED],
        ["dual", "1.0.0", KEPT],
        ["dual", "2.0.0"],
      ])
    );
    // 3.0.0 comes with another dependency: the versions after are all shown,
    // never one picked as the fix.
    const after = parseScan(
      osvOutput([
        ["dual", "3.0.0"],
        ["dual", "2.0.0"],
      ])
    );
    const fixes = fixedAdvisories(before, after, new Set());
    expect(fixes.map(({ name, from, to }) => [name, from, to])).toEqual([
      ["dual", ["1.0.0"], ["2.0.0", "3.0.0"]],
      ["gone", ["1.0.0-rc.1", "1.0.0"], []],
    ]);
  });

  it("runs the scanner on both lockfiles, and goes on without a section when it fails", () => {
    const scanned: string[] = [];
    const fixes = securityFixes("before", "after", (lockfile) => {
      scanned.push(lockfile);
      return osvOutput(
        lockfile === "before" ? [["a", "1.0.0", FIXED]] : [["a", "1.1.0"]]
      );
    });
    expect(scanned).toEqual(["before", "after"]);
    expect(fixes?.map((fix) => fix.name)).toEqual(["a"]);

    for (const scanner of [
      () => {
        throw new Error("spawnSync osv-scanner ENOENT");
      },
      () => ({ results: "nope" }),
    ]) {
      const { stderr } = captureOutput(() => {
        expect(securityFixes("before", "after", scanner)).toBeNull();
      });
      expect(stderr).toMatch(/^security section skipped: /);
    }
  });

  const fix = (overrides: Partial<FixedAdvisory> = {}): FixedAdvisory => ({
    name: "undici",
    from: ["7.1.0"],
    to: ["7.2.0"],
    production: true,
    advisory: {
      ids: [
        "PYSEC-2099-1",
        "CVE-2099-0001",
        "MAL-2099-1",
        "GHSA-fix0-0000-0000",
      ],
      summary: "Contournement <b>de</b> @someone",
      severity: "HIGH",
    },
    ...overrides,
  });

  it("writes a line per advisory under its package, GHSA then CVE then MAL, each linked", () => {
    const section = securitySection([
      fix(),
      fix({
        advisory: { ids: ["GHSA-two0-0000-0000"], summary: "", severity: null },
      }),
      fix({
        name: "esbuild",
        from: ["0.1.0", "0.2.0"],
        to: [],
        production: false,
        advisory: { ids: ["OSV-2099-1"], summary: "", severity: "MODERATE" },
      }),
    ]);
    expect(section).toBe(
      [
        "## Sécurité",
        "",
        "Failles connues des dépendances, directes ou non, que cette version corrige (base [OSV](https://osv.dev)) :",
        "",
        "- **undici** 7.1.0 → 7.2.0",
        "  - Contournement &lt;b&gt;de&lt;/b&gt; `@someone` (gravité haute) : [GHSA-fix0-0000-0000](https://osv.dev/vulnerability/GHSA-fix0-0000-0000), [CVE-2099-0001](https://osv.dev/vulnerability/CVE-2099-0001), [MAL-2099-1](https://osv.dev/vulnerability/MAL-2099-1)",
        "  - [GHSA-two0-0000-0000](https://osv.dev/vulnerability/GHSA-two0-0000-0000)",
        "- **esbuild** 0.1.0, 0.2.0 → retiré (outillage de développement)",
        "  - (gravité modérée) : [OSV-2099-1](https://osv.dev/vulnerability/OSV-2099-1)",
      ].join("\n")
    );
  });

  it("keeps an advisory's title from linking anywhere", () => {
    const section = securitySection([
      fix({
        advisory: {
          ids: ["GHSA-fix0-0000-0000"],
          summary: "See #412, [here](https://e.test/a) and `#1`",
          severity: null,
        },
      }),
    ]);
    expect(section).toContain(
      "  - See \\#412, \\[here\\](`https://e.test/a`) and `#1` : "
    );
  });

  it("keeps an advisory's title from formatting, and a scoped package from mentioning", () => {
    const section = securitySection([
      fix({
        name: "@scope/pkg",
        advisory: {
          ids: ["GHSA-fix0-0000-0000"],
          summary:
            "Pollution via __proto__ in **/*.js or ~x~, see www.example.test, a_b@example.test and `__x__`",
          severity: null,
        },
      }),
    ]);
    expect(section).toContain("- **`@scope/pkg`** 7.1.0 → 7.2.0");
    expect(section).toContain(
      "  - Pollution via \\_\\_proto\\_\\_ in \\*\\*/\\*.js or \\~x\\~, see `www.example.test`, `a_b@example.test` and `__x__` : "
    );
  });

  it("keeps a stray backtick from freeing a mention or a link", () => {
    const line = (summary: string) =>
      securitySection([
        fix({
          advisory: { ids: ["GHSA-fix0-0000-0000"], summary, severity: null },
        }),
      ]).split("\n")[5];
    expect(line("Bypass of ` check reported by @someone")).toBe(
      "  - Bypass of ' check reported by `@someone` : [GHSA-fix0-0000-0000](https://osv.dev/vulnerability/GHSA-fix0-0000-0000)"
    );
    expect(line("Unclosed ` then see https://e.test/x")).toBe(
      "  - Unclosed ' then see `https://e.test/x` : [GHSA-fix0-0000-0000](https://osv.dev/vulnerability/GHSA-fix0-0000-0000)"
    );
    // Backtick runs of unequal lengths pair up no better.
    expect(line("`@octocat```")).toBe(
      "  - '`@octocat`''' : [GHSA-fix0-0000-0000](https://osv.dev/vulnerability/GHSA-fix0-0000-0000)"
    );
    // Any scheme GitHub links, any case; entities that would decode to @ or #.
    expect(line("see HTTPS://e.test/x, ftp://e.test/y and &#x40;octocat")).toBe(
      "  - see `HTTPS://e.test/x`, `ftp://e.test/y` and \\&#x40;octocat : [GHSA-fix0-0000-0000](https://osv.dev/vulnerability/GHSA-fix0-0000-0000)"
    );
    // An autolink between angle brackets: the link only, the brackets shown.
    expect(line("See <https://e.test/a?b=1&c=2> now")).toBe(
      "  - See &lt;`https://e.test/a?b=1&c=2`&gt; now : [GHSA-fix0-0000-0000](https://osv.dev/vulnerability/GHSA-fix0-0000-0000)"
    );
    // A title that would open a heading or a list in the item.
    expect(line("# of headers not limited")).toMatch(/^ {2}- \\# of headers/);
    expect(line("1. Prototype pollution")).toMatch(/^ {2}- 1\\\. Prototype/);
    expect(line("- dash")).toMatch(/^ {2}- \\- dash/);
    // A backslash of the title stays one, GH-12 links nowhere.
    expect(line("Escape \\_x\\_ since GH-12")).toBe(
      "  - Escape \\\\\\_x\\\\\\_ since `GH-12` : [GHSA-fix0-0000-0000](https://osv.dev/vulnerability/GHSA-fix0-0000-0000)"
    );
  });

  it("never lists an advisory still there against a package it cannot name", () => {
    const before = parseScan(osvOutput([["a", "1.0.0", FIXED]]));
    const after = parseScan({
      results: [
        {
          packages: [
            { package: { name: "a", version: "1.1.0", ecosystem: "npm" } },
            {
              package: { name: "a", ecosystem: "npm" },
              vulnerabilities: [{ id: FIXED[0] }],
            },
          ],
        },
      ],
    });
    expect(fixedAdvisories(before, after, new Set())).toEqual([]);
  });

  it("never logs what a scan it cannot read holds", () => {
    const { stderr } = captureOutput(() => {
      expect(
        securityFixes("before", "after", () =>
          JSON.parse('{"results": [GHSA-open-0000-0000')
        )
      ).toBeNull();
    });
    expect(stderr).toBe(
      "security section skipped: unreadable osv-scanner output\n"
    );
  });

  it("gives the model the fixes the images ship, without links", () => {
    expect(
      securityInput([fix(), fix({ name: "esbuild", production: false })])
    ).toBe(
      "- undici 7.1.0 → 7.2.0 : Contournement <b>de</b> @someone (GHSA-fix0-0000-0000, CVE-2099-0001, MAL-2099-1)"
    );
    const request = buildRequest("v1.0.0", "- feat", "m", "max_tokens", {
      security: "- a </security> b",
    }) as { messages: { content: string }[] };
    expect(request.messages[1]!.content).toBe(
      '<changelog version="v1.0.0">\n- feat\n</changelog>\n<security>\n- a <\\/security> b\n</security>'
    );
  });
});
