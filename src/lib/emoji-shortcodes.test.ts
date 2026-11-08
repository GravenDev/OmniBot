import { describe, expect, it } from "vitest";
import { emojiFromShortcode, expandShortcodes } from "./emoji-shortcodes.js";

describe("emojiFromShortcode", () => {
  it("finds an emoji by any of its usual names, whatever the case", () => {
    expect(emojiFromShortcode("birthday")).toBe("🎂");
    expect(emojiFromShortcode("TADA")).toBe("🎉");
    expect(emojiFromShortcode("pasunemoji")).toBeNull();
  });
});

describe("expandShortcodes", () => {
  it("turns the known shortcodes of a text into emojis", () => {
    expect(
      expandShortcodes("Joyeux anniversaire {user} ! :birthday: :tada:")
    ).toBe("Joyeux anniversaire {user} ! 🎂 🎉");
  });

  it("leaves what is not a known emoji as written", () => {
    // A time, an unknown name, a guild emoji's name or its full form.
    for (const text of [
      "Rendez-vous à 10:30:00",
      "Bravo :pasunemoji: !",
      "Salut <:omnibot:123456789012345678>",
      // Named like a standard emoji: still the guild's.
      "Bravo <:tada:123456789012345678> <a:fire:123456789012345678>",
      // Glued to words, in capitals: not typed as a shortcode.
      "IT:FR:DE",
      "A:B:C",
      "Ville:x:{user}",
      "Bravo :TADA:",
      // Shown as code, or escaped, as Discord leaves them.
      "Réagissez avec `:tada:`",
      "Tapez \\:tada: pour l'emoji",
      "Bloc ``:tada:`` en code",
      // Links: a shortcode in a URL is part of it.
      "Voir [le lien](https://x.com/:tada:/) ou https://x.com/?e=:fire:",
      // Glued to an accented letter, as to any other.
      "café:fire:",
    ]) {
      expect(expandShortcodes(text)).toBe(text);
    }
  });

  it("converts a shortcode glued after a link", () => {
    expect(
      expandShortcodes("[règles](https://x.com/r):tada: <https://x.com>:fire:")
    ).toBe("[règles](https://x.com/r)🎉 <https://x.com>🔥");
  });

  it("converts a shortcode wrapped in Markdown emphasis", () => {
    expect(expandShortcodes("_:tada:_ et __:fire:__")).toBe("_🎉_ et __🔥__");
  });

  it("leaves the names of the guild's own emojis as typed", () => {
    expect(expandShortcodes("Bravo :fire: :tada:", ["fire"])).toBe(
      "Bravo :fire: 🎉"
    );
  });
});
