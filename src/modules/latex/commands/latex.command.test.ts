import { AttachmentBuilder, MessageFlags } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { ConfigProvider } from "#lib/config.js";
import type { LatexConfigSchema } from "#modules/latex/latex.config.js";

const renderFormula = vi.hoisted(() => vi.fn());

vi.mock("#modules/latex/rendering/formula.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("#modules/latex/rendering/formula.js")
  >()),
  renderFormula,
}));

const { FormulaError } = await import("#modules/latex/rendering/formula.js");
const { default: command } = await import("./latex.command.js");

function run(formula: string) {
  const interaction = {
    options: { getString: () => formula },
    deferReply: vi.fn(),
    editReply: vi.fn(),
    deleteReply: vi.fn(),
    followUp: vi.fn(),
  };
  const config = {
    get: () => "dark",
    t: (key: string, options?: Record<string, unknown>) =>
      `${key} ${JSON.stringify(options)}`,
  } as unknown as ConfigProvider<LatexConfigSchema>;
  return {
    interaction,
    done: command.execute(
      interaction as unknown as ChatInputCommandInteraction,
      config
    ),
  };
}

describe("/latex", () => {
  it("replies publicly with the image, the formula as its alt text", async () => {
    renderFormula.mockResolvedValueOnce(Buffer.from("png"));
    const { interaction, done } = run("x^2");
    await done;

    expect(renderFormula).toHaveBeenCalledWith("x^2", "dark");
    expect(interaction.deferReply).toHaveBeenCalledWith();
    const [reply] = interaction.editReply.mock.calls[0]!;
    const [file] = reply.files as AttachmentBuilder[];
    expect(file!.name).toBe("formula.png");
    expect(file!.description).toBe("x^2");
  });

  it("explains an invalid formula to its author only", async () => {
    renderFormula.mockRejectedValueOnce(new FormulaError("Missing }"));
    const { interaction, done } = run("\\frac{a");
    await done;

    expect(interaction.deleteReply).toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith({
      content: 'render.invalid {"error":"Missing }"}',
      flags: MessageFlags.Ephemeral,
    });
  });

  it("lets an unexpected error reach the dispatcher", async () => {
    renderFormula.mockRejectedValueOnce(new Error("boom"));

    await expect(run("x").done).rejects.toThrow("boom");
  });
});
