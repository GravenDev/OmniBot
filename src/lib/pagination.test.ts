import { ButtonStyle } from "discord.js";
import { describe, expect, it } from "vitest";
import type { TFunction } from "./i18n.js";
import { pageRow } from "./pagination.js";

const t = ((key: string, options?: Record<string, unknown>) =>
  `${key}:${JSON.stringify(options ?? {})}`) as TFunction;
const id = (target: number | string) => `page:${target}`;

describe("pageRow", () => {
  it("keeps the previous, indicator and next buttons by default", () => {
    const row = pageRow(t, id, 2, 4, "list.page").toJSON();
    expect(row.components).toHaveLength(3);
    expect(row.components[0]).toMatchObject({
      custom_id: "page:1",
      disabled: false,
    });
    expect(row.components[1]).toMatchObject({
      custom_id: "page:indicator",
      disabled: true,
      style: ButtonStyle.Success,
    });
    expect(row.components[2]).toMatchObject({
      custom_id: "page:3",
      disabled: false,
    });
  });

  it("can drop the indicator and use custom arrow labels", () => {
    const row = pageRow(t, id, 1, 1, "list.page", {
      previousLabel: "<",
      nextLabel: ">",
      indicator: false,
    }).toJSON();
    expect(row.components).toEqual([
      expect.objectContaining({
        custom_id: "page:0",
        label: "<",
        disabled: true,
      }),
      expect.objectContaining({
        custom_id: "page:2",
        label: ">",
        disabled: true,
      }),
    ]);
  });
});
