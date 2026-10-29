import { describe, expect, it, vi } from "vitest";

vi.mock("#lib/database.js", () => ({ default: {} }));

const { panelMessage } = await import("./panel.js");

const t = (key: string) => key;

function row(change: Record<string, unknown> = {}) {
  return {
    channelId: "c1",
    guildId: "g1",
    hubId: "h1",
    ownerId: "owner",
    locked: false,
    hidden: false,
    trusted: [] as string[],
    blocked: [] as string[],
    panelMessageId: "m1",
    createdAt: new Date(),
    ...change,
  };
}

function render(memberIds: string[], change = {}, ownerPresent?: boolean) {
  const channel = {
    name: "Salon *de* Loïc",
    userLimit: 0,
    members: new Map(memberIds.map((id) => [id, {}])),
  } as any;
  const [container] = panelMessage(
    row(change),
    channel,
    t,
    ownerPresent
  ).components;
  return JSON.stringify(container!.toJSON());
}

describe("panelMessage", () => {
  it("offers the claim button only when the owner is away", () => {
    expect(render(["owner"])).not.toContain("tempvoice:claim:c1");
    expect(render(["guest"])).toContain("tempvoice:claim:c1");
    expect(render([], {}, true)).not.toContain("tempvoice:claim:c1");
  });

  it("preselects the current access mode", () => {
    const rendered = JSON.parse(render(["owner"], { locked: true }));
    const select = rendered.components
      .flatMap((c: any) => c.components ?? [])
      .find((c: any) => c.custom_id === "tempvoice-access:c1");
    expect(
      select.options.filter((o: any) => o.default).map((o: any) => o.value)
    ).toEqual(["invite"]);
  });

  it("escapes markdown in the channel name", () => {
    expect(render(["owner"])).toContain("Salon \\\\*de\\\\* Loïc");
  });
});
