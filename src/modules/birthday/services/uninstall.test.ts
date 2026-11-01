import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createT } from "#lib/i18n.js";
import { initTestI18n } from "#lib/testing.js";
import en from "../i18n/en.json" with { type: "json" };
import fr from "../i18n/fr.json" with { type: "json" };

const service = vi.hoisted(() => ({ count: vi.fn() }));
vi.mock("./birthday.service.js", () => ({ default: service }));

const { uninstallWarning } = await import("./uninstall.js");

beforeAll(async () => {
  await initTestI18n("birthday", { en, fr });
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("uninstallWarning", () => {
  it("says how many birthdays would be deleted", async () => {
    service.count.mockResolvedValue(42);
    expect(await uninstallWarning("guild", createT("fr", "birthday"))).toBe(
      "Désactiver ce module supprime définitivement les **42 anniversaires** enregistrés sur ce serveur. Seuls les membres pourront les enregistrer à nouveau, avec `/birthday set`."
    );
  });

  it("asks nothing when no birthday is registered", async () => {
    service.count.mockResolvedValue(0);
    expect(
      await uninstallWarning("guild", createT("fr", "birthday"))
    ).toBeNull();
  });
});
