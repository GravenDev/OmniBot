import { beforeAll, describe, expect, expectTypeOf, it } from "vitest";
import {
  ConfigProvider,
  ConfigType,
  ConfigValidator,
  formatConfigValue,
  getConfigTypeName,
  isEnumEntry,
  type ConfigData,
  type ConfigEntry,
  type ConfigSchema,
} from "./config.js";
import { addTranslations, initI18n } from "./i18n.js";
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

  describe("ENUM", () => {
    // Option membership is enforced by the enum handler, not this generic
    // predicate, so any string passes here.
    it.each(["anything", "", "élevé"])("accepts %j", (value) => {
      expect(ConfigValidator.ENUM(value)).toBe(true);
    });
  });
});

describe("getConfigTypeName", () => {
  it("capitalizes a simple type name", () => {
    expect(getConfigTypeName(ConfigType.STRING)).toBe("Text");
    expect(getConfigTypeName(ConfigType.NUMBER)).toBe("Number");
    expect(getConfigTypeName(ConfigType.CATEGORY)).toBe("Category");
    expect(getConfigTypeName(ConfigType.ENUM)).toBe("Choice");
  });

  it("describes a list type", () => {
    expect(getConfigTypeName([ConfigType.ROLE])).toBe("List of role");
    expect(getConfigTypeName([ConfigType.ENUM])).toBe("List of choice");
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
    mode: {
      name: "Mode",
      description: "A fixed choice",
      type: ConfigType.ENUM,
      options: ["light", "dark"] as const,
      defaultValue: "light",
    },
    tags: {
      name: "Tags",
      description: "Several fixed choices",
      type: [ConfigType.ENUM],
      options: ["a", "b", "c"] as const,
    },
  } satisfies ConfigSchema;

  const module = { config: schema } as unknown as Module<typeof schema>;

  it("returns stored values by key", () => {
    const provider = new ConfigProvider(module, {
      greeting: "hi",
      count: 7,
      mode: "dark",
      tags: ["a", "c"],
    });

    expect(provider.get("greeting")).toBe("hi");
    expect(provider.get("count")).toBe(7);
    expect(provider.get("mode")).toBe("dark");
    expect(provider.get("tags")).toEqual(["a", "c"]);
  });

  it("exposes the module schema", () => {
    const provider = new ConfigProvider(module, {
      greeting: "hi",
      count: 7,
      mode: "light",
    });

    expect(provider.schema).toBe(schema);
  });

  it("reads an unset field (no default) as undefined", () => {
    const provider = new ConfigProvider(module, {
      count: 5,
      mode: "light",
    } as ConfigData<typeof schema>);

    expect(provider.get("greeting")).toBeUndefined();
  });

  it("types values by the presence of a defaultValue", () => {
    const provider = new ConfigProvider(module, {
      greeting: "hi",
      count: 7,
      mode: "light",
    });

    // `count` declares a default → always present.
    expectTypeOf(provider.get("count")).toEqualTypeOf<number>();
    // `greeting` has no default → may be unset.
    expectTypeOf(provider.get("greeting")).toEqualTypeOf<string | undefined>();
  });

  it("types an enum value as the literal union of its options", () => {
    const provider = new ConfigProvider(module, {
      greeting: "hi",
      count: 7,
      mode: "light",
    });

    // `mode` has a default → always one of the literal options.
    expectTypeOf(provider.get("mode")).toEqualTypeOf<"light" | "dark">();
    // `tags` is an enum list with no default → array of options, or unset.
    expectTypeOf(provider.get("tags")).toEqualTypeOf<
      ("a" | "b" | "c")[] | undefined
    >();
  });
});

describe("ConfigProvider default resolution", () => {
  beforeAll(async () => {
    await initI18n();
    addTranslations("fr", "test-mod", {
      "config.note.default": "Bonjour",
    });
  });

  const schema = {
    note: {
      name: "Note",
      description: "A note",
      type: ConfigType.STRING,
      defaultValue: "Hello",
    },
    count: {
      name: "Count",
      description: "A count",
      type: ConfigType.NUMBER,
      defaultValue: 5,
    },
    mode: {
      name: "Mode",
      description: "A choice",
      type: ConfigType.ENUM,
      options: ["light", "dark"] as const,
      defaultValue: "light",
    },
    greeting: {
      name: "Greeting",
      description: "No default",
      type: ConfigType.STRING,
    },
  } satisfies ConfigSchema;

  const module = {
    id: "test-mod",
    config: schema,
  } as unknown as Module<typeof schema>;

  const empty = {} as ConfigData<typeof schema>;

  it("resolves an unset string default through the locale", () => {
    const provider = new ConfigProvider(module, empty, "fr");
    expect(provider.get("note")).toBe("Bonjour");
  });

  it("falls back to the schema default when no translation matches", () => {
    const provider = new ConfigProvider(module, empty, "en");
    expect(provider.get("note")).toBe("Hello");
  });

  it("returns non-string defaults verbatim (numbers, enums)", () => {
    const provider = new ConfigProvider(module, empty, "fr");
    expect(provider.get("count")).toBe(5);
    // Enum defaults are stored identifiers, never translated.
    expect(provider.get("mode")).toBe("light");
  });

  it("prefers a stored value over the default", () => {
    const provider = new ConfigProvider(
      module,
      { note: "stored" } as ConfigData<typeof schema>,
      "fr"
    );
    expect(provider.get("note")).toBe("stored");
  });

  it("returns undefined for an unset field without a default", () => {
    const provider = new ConfigProvider(module, empty, "fr");
    expect(provider.get("greeting")).toBeUndefined();
  });

  describe("isDefault", () => {
    it("is true for an unset field that declares a default", () => {
      const provider = new ConfigProvider(module, empty, "fr");
      expect(provider.isDefault("note")).toBe(true);
    });

    it("is false once a value is stored", () => {
      const provider = new ConfigProvider(
        module,
        { note: "stored" } as ConfigData<typeof schema>,
        "fr"
      );
      expect(provider.isDefault("note")).toBe(false);
    });

    it("is false for an unset field without a default", () => {
      const provider = new ConfigProvider(module, empty, "fr");
      expect(provider.isDefault("greeting")).toBe(false);
    });

    it("treats a cleared value (null) as explicitly set, not default", () => {
      const provider = new ConfigProvider(
        module,
        { note: null } as unknown as ConfigData<typeof schema>,
        "fr"
      );
      expect(provider.isDefault("note")).toBe(false);
    });
  });
});

describe("ConfigEntry enum typing", () => {
  it("requires `options` on an enum entry (regression for the missing-options hole)", () => {
    const valid: ConfigEntry<ConfigType> = {
      name: "x",
      description: "y",
      type: ConfigType.ENUM,
      options: ["a", "b"],
    };

    // @ts-expect-error — an ENUM entry without `options` must not type-check
    const invalid: ConfigEntry<ConfigType> = {
      name: "x",
      description: "y",
      type: ConfigType.ENUM,
    };

    expect(valid.type).toBe(ConfigType.ENUM);
    expect(invalid.type).toBe(ConfigType.ENUM);
  });
});

describe("formatConfigValue", () => {
  const langEntry: ConfigEntry<ConfigType> = {
    name: "Language",
    description: "",
    type: ConfigType.ENUM,
    options: ["en", "fr"],
    display: "language",
  };

  it("renders a language enum value as its name in the viewer locale", () => {
    expect(formatConfigValue(langEntry, "fr", "fr")).toBe("Français");
    expect(formatConfigValue(langEntry, "en", "fr")).toBe("Anglais");
    expect(formatConfigValue(langEntry, "fr", "en")).toBe("French");
    expect(formatConfigValue(langEntry, "en", "en")).toBe("English");
  });

  it("returns the raw value for an enum without a display hint", () => {
    const plain: ConfigEntry<ConfigType> = {
      name: "Mode",
      description: "",
      type: ConfigType.ENUM,
      options: ["a", "b"],
    };
    expect(formatConfigValue(plain, "a", "fr")).toBe("a");
  });

  it("stringifies a non-enum value", () => {
    const str: ConfigEntry<ConfigType> = {
      name: "Note",
      description: "",
      type: ConfigType.STRING,
    };
    expect(formatConfigValue(str, "hello", "fr")).toBe("hello");
  });
});

describe("isEnumEntry", () => {
  it("recognizes single and list enum entries", () => {
    expect(
      isEnumEntry({
        name: "m",
        description: "",
        type: ConfigType.ENUM,
        options: ["x"],
      })
    ).toBe(true);
    expect(
      isEnumEntry({
        name: "m",
        description: "",
        type: [ConfigType.ENUM],
        options: ["x"],
      })
    ).toBe(true);
  });

  it("rejects non-enum entries and undefined", () => {
    expect(
      isEnumEntry({ name: "s", description: "", type: ConfigType.STRING })
    ).toBe(false);
    expect(
      isEnumEntry({ name: "l", description: "", type: [ConfigType.ROLE] })
    ).toBe(false);
    expect(isEnumEntry(undefined)).toBe(false);
  });
});
