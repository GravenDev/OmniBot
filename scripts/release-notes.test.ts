import { describe, expect, it, vi } from "vitest";
import {
  aiSettings,
  assembleNotes,
  buildRequest,
  escapeHtml,
  explainingParagraph,
  compareTags,
  extractJson,
  imageRefs,
  imagesSection,
  lookupDigest,
  moduleGlossary,
  neutralizeMentions,
  parseArgs,
  parseSummary,
  previousTag,
  sortTags,
  summaryInput,
  unknownCommands,
  writeSummary,
  type ImageRef,
} from "./release-notes.js";

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

  it("puts the summary first and the technical changelog last", () => {
    const notes = assembleNotes({
      githubRepository: "GravenDev/OmniBot",
      tag: "v1.1.0",
      previous: "v1.0.0",
      technical: "### Nouveautés\n\n- x",
      images,
      summary: { visible: true, fr: "- a", en: "- b" },
    });
    const order = [
      "## Quoi de neuf",
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
