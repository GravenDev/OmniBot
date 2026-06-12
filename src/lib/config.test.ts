import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ConfigProvider,
  ConfigType,
  ConfigValidator,
  getConfigTypeName,
  type ConfigData,
  type ConfigSchema,
} from "./config.js";
import type { Module } from "./module.js";

describe("ConfigValidator", () => {
  describe("STRING", () => {
    it("accepts any string, including empty", () => {
      expect(ConfigValidator.STRING("")).toBe(true);
      expect(ConfigValidator.STRING("hello")).toBe(true);
    });
  });

  describe("NUMBER", () => {
    it.each(["42", "3.14", "-7", "0", "  12 "])("accepts %j", (value) => {
      expect(ConfigValidator.NUMBER(value)).toBe(true);
    });

    it.each(["", "   ", "abc", "12abc", "Infinity", "NaN"])(
      "rejects %j",
      (value) => {
        expect(ConfigValidator.NUMBER(value)).toBe(false);
      }
    );
  });

  describe("BOOLEAN", () => {
    it.each(["true", "false", "TRUE", "False"])("accepts %j", (value) => {
      expect(ConfigValidator.BOOLEAN(value)).toBe(true);
    });

    it.each(["yes", "1", "", "truthy"])("rejects %j", (value) => {
      expect(ConfigValidator.BOOLEAN(value)).toBe(false);
    });
  });

  describe("USER", () => {
    it.each(["<@123>", "<@!123>", "123456789"])("accepts %j", (value) => {
      expect(ConfigValidator.USER(value)).toBe(true);
    });

    it.each(["<@&123>", "<#123>", "abc", "<@>"])("rejects %j", (value) => {
      expect(ConfigValidator.USER(value)).toBe(false);
    });
  });

  describe("ROLE", () => {
    it.each(["<@&123>", "123"])("accepts %j", (value) => {
      expect(ConfigValidator.ROLE(value)).toBe(true);
    });

    it.each(["<@123>", "<#123>", "abc"])("rejects %j", (value) => {
      expect(ConfigValidator.ROLE(value)).toBe(false);
    });
  });

  describe.each([ConfigType.CHANNEL, ConfigType.CATEGORY])("%s", (type) => {
    it.each(["<#123>", "123"])("accepts %j", (value) => {
      expect(ConfigValidator[type](value)).toBe(true);
    });

    it.each(["<@123>", "<@&123>", "abc"])("rejects %j", (value) => {
      expect(ConfigValidator[type](value)).toBe(false);
    });
  });
});

describe("getConfigTypeName", () => {
  it("capitalizes a simple type name", () => {
    expect(getConfigTypeName(ConfigType.STRING)).toBe("Text");
    expect(getConfigTypeName(ConfigType.NUMBER)).toBe("Number");
    expect(getConfigTypeName(ConfigType.CATEGORY)).toBe("Category");
  });

  it("describes a list type", () => {
    expect(getConfigTypeName([ConfigType.ROLE])).toBe("List of role");
  });
});

describe("ConfigProvider", () => {
  const schema = {
    greeting: {
      name: "Greeting",
      description: "A greeting",
      type: ConfigType.STRING,
    },
    count: {
      name: "Count",
      description: "A count",
      type: ConfigType.NUMBER,
      defaultValue: 5,
    },
  } satisfies ConfigSchema;

  const module = { config: schema } as unknown as Module<typeof schema>;

  it("returns stored values by key", () => {
    const provider = new ConfigProvider(module, { greeting: "hi", count: 7 });

    expect(provider.get("greeting")).toBe("hi");
    expect(provider.get("count")).toBe(7);
  });

  it("exposes the module schema", () => {
    const provider = new ConfigProvider(module, { greeting: "hi", count: 7 });

    expect(provider.schema).toBe(schema);
  });

  it("reads an unset field (no default) as undefined", () => {
    const provider = new ConfigProvider(module, {
      count: 5,
    } as ConfigData<typeof schema>);

    expect(provider.get("greeting")).toBeUndefined();
  });

  it("types values by the presence of a defaultValue", () => {
    const provider = new ConfigProvider(module, { greeting: "hi", count: 7 });

    // `count` declares a default → always present.
    expectTypeOf(provider.get("count")).toEqualTypeOf<number>();
    // `greeting` has no default → may be unset.
    expectTypeOf(provider.get("greeting")).toEqualTypeOf<string | undefined>();
  });
});
