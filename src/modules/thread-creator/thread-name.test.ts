import type { Message } from "discord.js";
import { describe, expect, it } from "vitest";
import { generateThreadName } from "./thread-name.js";

function fakeMessage(content: string, displayName: string): Message {
  return {
    content,
    author: { displayName, username: displayName },
  } as unknown as Message;
}

describe("generateThreadName", () => {
  it("substitutes {messageAuthor}", () => {
    const result = generateThreadName(
      "Thread by {messageAuthor}",
      fakeMessage("hello", "Alice")
    );
    expect(result).toBe("Thread by Alice");
  });

  it("substitutes {messageContent}", () => {
    const result = generateThreadName(
      "Re: {messageContent}",
      fakeMessage("my question", "Bob")
    );
    expect(result).toBe("Re: my question");
  });

  it("truncates messageContent to 50 chars before substitution", () => {
    const longContent = "a".repeat(80);
    const result = generateThreadName(
      "{messageContent}",
      fakeMessage(longContent, "Bob")
    );
    expect(result).toBe("a".repeat(50));
  });

  it("truncates result to 100 chars (Discord limit)", () => {
    const result = generateThreadName(
      "{messageAuthor}",
      fakeMessage("x", "a".repeat(200))
    );
    expect(result).toHaveLength(100);
  });

  it("does not treat $& in user content as a backreference", () => {
    // Without the escape fix, $& in the replacement string would expand to
    // the matched pattern ({messageContent}), yielding "{messageContent} is..."
    const result = generateThreadName(
      "{messageContent}",
      fakeMessage("$& is literal", "Bob")
    );
    expect(result).toBe("$& is literal");
  });

  it("does not treat $1 in author name as a backreference", () => {
    const result = generateThreadName(
      "Thread by {messageAuthor}",
      fakeMessage("hi", "$1 user")
    );
    expect(result).toBe("Thread by $1 user");
  });

  it("does not treat $$ in content as a special sequence", () => {
    const result = generateThreadName(
      "{messageContent}",
      fakeMessage("cost is $$5", "Bob")
    );
    expect(result).toBe("cost is $$5");
  });
  it("turns line breaks of the content into spaces", () => {
    const result = generateThreadName(
      "{messageContent}",
      fakeMessage("first\nsecond\nthird", "Bob")
    );
    expect(result).toBe("first second third");
  });

  it("fills every occurrence of a placeholder", () => {
    const result = generateThreadName(
      "{messageAuthor} / {messageAuthor}",
      fakeMessage("hi", "Alice")
    );
    expect(result).toBe("Alice / Alice");
  });

  it("keeps the placeholders the content writes, when already filled", () => {
    // Substitution runs variable by variable: {messageAuthor} is filled
    // before the content arrives, so the content's own copy stays.
    const result = generateThreadName(
      "{messageContent}",
      fakeMessage("{messageAuthor} {messageContent}", "Alice")
    );
    expect(result).toBe("{messageAuthor} {messageContent}");
  });
});
