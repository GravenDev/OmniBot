import { describe, expect, it } from "vitest";
import { processWords, subjectDescribesChange } from "./commit-subject.js";

describe("processWords", () => {
  it("quotes the phrase alone, without the separator before it", () => {
    expect(processWords("render-preview, suites de revue")).toBe(
      "suites de revue"
    );
  });

  it.each([
    "suites de la revue des réglages SonarCloud",
    "réglages SonarCloud après la première revue",
    "retours de revue",
    "corrections diverses",
    "ajustements",
    "divers",
    "wip",
    "address review feedback",
    "review fixes",
    "misc tweaks",
    "corrections de la revue",
    "corrections de la revue indépendante",
    "corrige la revue",
    "corrige les retours de la revue",
    "corrige la relecture finale",
    "render-preview, retours de la revue",
    "retours de review",
    "suites de la review",
    "apply suggestion from review and update consolidated schema",
    "Apply suggestions from code review",
    "fixes after review",
    "prise en compte de la revue",
    "applique la revue",
    "corrections post-revue",
    "corrections de la revue de code",
    "corrections suite aux retours",
    "corrige les remarques de la revue",
    "revue",
    "review",
    "fixes from review",
    "render-preview : suites de revue",
    "render-preview — suites de la revue",
    "misc. tweaks",
  ])("refuses « %s », which names a work step", (subject) => {
    expect(processWords(subject)).not.toBeNull();
  });

  it.each([
    "codes d'erreur Discord reconnus par leur sens",
    "copy-check refuse le code recopié d'un module à l'autre",
    "revue de la configuration exposée dans /config",
    "le module reports gère les revues de messages",
    "wipe the cache on uninstall",
    // « relecture » is also what four-hour-game does to a server's history:
    // the word alone proves nothing.
    "messages en direct après la relecture de leur serveur",
    "relecture complète de l'arrêt et points des 4h rattrapés",
    "affiche la suite de la revue",
    "corrige la revue des messages signalés",
    "tweak the cooldown to 30 s",
    "mentionne la branche wip/animated-webp",
    "range les aides de src/lib/misc.ts",
  ])("accepts « %s », which says what changes", (subject) => {
    expect(processWords(subject)).toBeNull();
  });
});

describe("subjectDescribesChange", () => {
  it("fails on a work step and quotes it", () => {
    const [ok, message] = subjectDescribesChange({
      subject: "suites de la revue",
    });
    expect(ok).toBe(false);
    expect(message).toContain("« suites de la revue »");
  });

  it("passes a subject that says what changes, or no subject at all", () => {
    expect(
      subjectDescribesChange({ subject: "codes d'erreur reconnus" })[0]
    ).toBe(true);
    expect(subjectDescribesChange({ subject: null })[0]).toBe(true);
  });
});
