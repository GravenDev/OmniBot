import { describe, expect, it } from "vitest";
import chessCommand from "./chess.command.js";

interface CommandOption {
  name: string;
  required?: boolean;
  options?: CommandOption[];
  choices?: Array<{ value: string }>;
}

const groups = (chessCommand.data.toJSON().options ?? []) as CommandOption[];
const view = groups.find((entry) => entry.name === "view");

function source(name: string): CommandOption | undefined {
  return view?.options?.find((entry) => entry.name === name);
}

function option(sourceName: string, name: string): CommandOption | undefined {
  return source(sourceName)?.options?.find((entry) => entry.name === name);
}

describe("/chess view", () => {
  it("keeps the sources in the view group, next to watch", () => {
    expect(groups.map((entry) => entry.name)).toEqual(["view", "watch"]);
    expect(view?.options?.map((entry) => entry.name)).toEqual([
      "lichess",
      "chesscom",
      "url",
      "pgn",
    ]);
  });

  it("offers the three modes on every source", () => {
    for (const name of ["lichess", "chesscom", "url", "pgn"]) {
      expect(option(name, "mode")).toMatchObject({
        name: "mode",
        required: false,
        choices: [{ value: "view" }, { value: "report" }, { value: "analyse" }],
      });
    }
  });

  it("has no side option for username sources", () => {
    for (const name of ["lichess", "chesscom"]) {
      expect(option(name, "side")).toBeUndefined();
    }
  });

  it("keeps the side optional for imported sources, checked at runtime", () => {
    for (const name of ["url", "pgn"]) {
      expect(option(name, "side")).toMatchObject({
        name: "side",
        required: false,
        choices: [{ value: "white" }, { value: "black" }],
      });
    }
  });
});

describe("/chess watch", () => {
  const watch = groups.find((entry) => entry.name === "watch");

  it("takes a username or a URL, never a PGN", () => {
    expect(watch?.options?.map((entry) => entry.name)).toEqual([
      "lichess",
      "chesscom",
      "url",
    ]);
    for (const name of ["lichess", "chesscom"]) {
      expect(
        watch?.options?.find((entry) => entry.name === name)?.options
      ).toMatchObject([{ name: "username", required: true }]);
    }
    expect(
      watch?.options?.find((entry) => entry.name === "url")?.options
    ).toMatchObject([{ name: "url", required: true }]);
  });

  it("has no analysis mode or side option", () => {
    for (const name of ["lichess", "chesscom", "url"]) {
      const options = watch?.options?.find(
        (entry) => entry.name === name
      )?.options;
      expect(options?.map((entry) => entry.name)).toEqual(
        name === "url" ? ["url"] : ["username"]
      );
    }
  });
});
