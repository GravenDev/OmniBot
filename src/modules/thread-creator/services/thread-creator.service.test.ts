import type { Message } from "discord.js";
import { describe, expect, it } from "vitest";
import service from "./thread-creator.service.js";

function fakeMessage(content: string, displayName: string): Message {
  return {
    content,
    author: { displayName, username: displayName },
  } as unknown as Message;
}

describe("generateThreadName", () => {
  it("substitutes {messageAuthor}", () => {
    const result = service.generateThreadName(
      "Thread by {messageAuthor}",
      fakeMessage("hello", "Alice")
    );
    expect(result).toBe("Thread by Alice");
  });

  it("substitutes {messageContent}", () => {
    const result = service.generateThreadName(
      "Re: {messageContent}",
      fakeMessage("my question", "Bob")
    );
    expect(result).toBe("Re: my question");
  });

  it("truncates messageContent to 50 chars before substitution", () => {
    const longContent = "a".repeat(80);
    const result = service.generateThreadName(
      "{messageContent}",
      fakeMessage(longContent, "Bob")
    );
    expect(result).toBe("a".repeat(50));
  });

  it("truncates result to 100 chars (Discord limit)", () => {
    const result = service.generateThreadName(
      "{messageAuthor}",
      fakeMessage("x", "a".repeat(200))
    );
    expect(result).toHaveLength(100);
  });

  it("does not treat $& in user content as a backreference", () => {
    // Without the escape fix, $& in the replacement string would expand to
    // the matched pattern ({messageContent}), yielding "{messageContent} is..."
    const result = service.generateThreadName(
      "{messageContent}",
      fakeMessage("$& is literal", "Bob")
    );
    expect(result).toBe("$& is literal");
  });

  it("does not treat $1 in author name as a backreference", () => {
    const result = service.generateThreadName(
      "Thread by {messageAuthor}",
      fakeMessage("hi", "$1 user")
    );
    expect(result).toBe("Thread by $1 user");
  });

  it("does not treat $$ in content as a special sequence", () => {
    const result = service.generateThreadName(
      "{messageContent}",
      fakeMessage("cost is $$5", "Bob")
    );
    expect(result).toBe("cost is $$5");
  });
});
