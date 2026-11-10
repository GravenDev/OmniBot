// Project rules for oxlint (JS plugin, loaded from .oxlintrc.json).

/** A string written as a literal, quoted or as a template without `${}`. */
function staticString(node) {
  if (node?.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  if (node?.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
  return null;
}

/** Name of a member expression's property, computed string keys included. */
function propertyName(node) {
  if (node?.type !== "MemberExpression") {
    return null;
  }
  if (!node.computed && node.property.type === "Identifier") {
    return node.property.name;
  }
  return staticString(node.property);
}

/** TypeScript wrappers that change nothing at runtime: `x!`, `x as T`. */
const TS_WRAPPERS = new Set([
  "TSNonNullExpression",
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
]);

function unwrap(node) {
  while (node && TS_WRAPPERS.has(node.type)) {
    node = node.expression;
  }
  return node;
}

/**
 * Whether `node` is the members manager: `guild.members`, or `members`. Under
 * another name (`const m = guild.members`) it is not recognised: following
 * aliases would need scope analysis, for a pattern no module uses.
 */
function isMembers(node) {
  node = unwrap(node);
  return (
    propertyName(node) === "members" ||
    (node?.type === "Identifier" && node.name === "members")
  );
}

/**
 * Name of an object property's key, `{ a: … }` and `{ "a": … }` alike; null
 * for a key computed at runtime (`{ [key]: … }`), which could be anything.
 */
function keyName(property) {
  if (property.type !== "Property") {
    return null;
  }
  if (property.computed) {
    return staticString(property.key);
  }
  return property.key.name ?? property.key.value;
}

/** Whether a value is written as `undefined` or `null`, which mean nothing. */
function isNothing(node) {
  return (
    (node.type === "Identifier" && node.name === "undefined") ||
    (node.type === "Literal" && node.value === null)
  );
}

/** Name of the object a member expression is read from, when an identifier. */
function objectName(node) {
  return node.object.type === "Identifier" ? node.object.name : null;
}

/**
 * Options naming whom to fetch: a guild's `user`, or a thread's `member`.
 * Without types, a thread and a guild look the same: `member` passed to a
 * guild's `members.fetch` by mistake, a whole-guild request, gets through.
 */
const TARGET_KEYS = new Set(["user", "member"]);

/** Whether an option is missing, or written as the given value. */
function absentOr(options, key, value) {
  const property = options.properties.find((p) => keyName(p) === key);
  return (
    !property ||
    isNothing(property.value) ||
    (property.value.type === "Literal" && property.value.value === value) ||
    staticString(property.value) === value
  );
}

/**
 * Whether a `members.fetch(...)` call asks for the whole guild, the request
 * Discord rate limits: no argument, or options naming nobody with an empty
 * `query` and no `limit` (discord.js's defaults). A search (`query: "ab"`),
 * a capped request (`limit: 10`) or given members, a guild's by id or a
 * thread's, are fine. Options built elsewhere (a variable, a spread) cannot
 * be read here and are let through.
 *
 * Without types, a thread's `members.fetch()` (all its members, over REST)
 * looks the same: disable the rule on that line, saying why.
 */
function fetchesWholeGuild(args) {
  if (args.length === 0) {
    return true;
  }
  const [options] = args;
  if (isNothing(options)) {
    return true;
  }
  return (
    options.type === "ObjectExpression" &&
    options.properties.every((property) => property.type === "Property") &&
    !options.properties.some(
      (property) =>
        TARGET_KEYS.has(keyName(property)) && !isNothing(property.value)
    ) &&
    absentOr(options, "query", "") &&
    absentOr(options, "limit", 0)
  );
}

/**
 * Discord's member list endpoint, in a URL written by hand. In a template,
 * each `${}` stands as a NUL: `/members${query}` is the list too. A URL put
 * together in pieces (`+`, `${Routes.guild(id)}/members`) is not seen:
 * matching `/members` alone would catch other services' URLs.
 */
const MEMBER_LIST_URL = /guilds\/[^/?#]+\/members(?:$|[?#\0])/;

/** Request Guild Members, the gateway opcode behind a whole-guild fetch. */
const REQUEST_GUILD_MEMBERS = 8;

const noWholeGuildMemberFetch = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Fetch a whole guild's members through #lib/guild-members.js, which shares the request between modules, never around it.",
    },
    messages: {
      shared:
        "Use allMembers(guild) or loadAllMembers(guild) from #lib/guild-members.js: Discord rate limits whole-guild member requests (about one per 30 s per guild), so modules must share them.",
    },
    schema: [],
  },
  create(context) {
    const report = (node) => context.report({ node, messageId: "shared" });
    return {
      // discord.js: `guild.members.fetch()`, `guild.members.list()`.
      CallExpression(node) {
        const method = propertyName(node.callee);
        if (!isMembers(node.callee.object)) {
          return;
        }
        if (
          method === "list" ||
          (method === "fetch" && fetchesWholeGuild(node.arguments))
        ) {
          report(node);
        }
      },
      // Around discord.js: `client.rest.get(Routes.guildMembers(id))`, or the
      // gateway opcode sent by hand.
      MemberExpression(node) {
        const name = propertyName(node);
        if (
          (objectName(node) === "Routes" && name === "guildMembers") ||
          (objectName(node) === "GatewayOpcodes" &&
            name === "RequestGuildMembers")
        ) {
          report(node);
        }
      },
      // `{ op: 8, d: { guild_id, query: "", limit: 0 } }` on the WebSocket:
      // a gateway payload, `op` and `d`, not any object with an `op`.
      ObjectExpression(node) {
        const op = node.properties.find((p) => keyName(p) === "op");
        if (
          op?.value.type === "Literal" &&
          op.value.value === REQUEST_GUILD_MEMBERS &&
          node.properties.some((p) => keyName(p) === "d")
        ) {
          report(node);
        }
      },
      // `fetch("https://discord.com/api/v10/guilds/…/members?limit=1000")`.
      Literal(node) {
        if (
          typeof node.value === "string" &&
          MEMBER_LIST_URL.test(node.value)
        ) {
          report(node);
        }
      },
      TemplateLiteral(node) {
        const url = node.quasis.map((quasi) => quasi.value.cooked).join("\0");
        if (MEMBER_LIST_URL.test(url)) {
          report(node);
        }
      },
    };
  },
};

/** discord.js's REST methods: `client.rest.get(…)`, `rest.put(…)`. */
const REST_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

/** The REST methods that take their route in options: `{ fullRoute }`. */
const REST_REQUESTS = new Set(["request", "raw", "queueRequest"]);

/** Whether `node` is a REST client: `rest`, or `<anything>.rest`. */
function isRest(node) {
  node = unwrap(node);
  return (
    (node?.type === "Identifier" && node.name === "rest") ||
    propertyName(node) === "rest"
  );
}

/**
 * The text written by hand in a route: a string, a template (each `${}` as a
 * NUL) or a `+` of them; null when nothing in it is written by hand (a
 * `Routes` call, a variable).
 */
function handText(node) {
  node = unwrap(node);
  if (isRoutesCall(node)) {
    // A route discord.js has, here put together with text: a path.
    return "/";
  }
  if (node?.type === "TemplateLiteral") {
    return node.quasis
      .map(
        (quasi, i) =>
          quasi.value.cooked +
          (i < node.expressions.length
            ? isRoutesCall(node.expressions[i])
              ? "/"
              : "\0"
            : "")
      )
      .join("");
  }
  if (node?.type === "BinaryExpression" && node.operator === "+") {
    const left = handText(node.left);
    const right = handText(node.right);
    return left === null && right === null
      ? null
      : `${left ?? "\0"}${right ?? "\0"}`;
  }
  return staticString(node);
}

/**
 * Discord's API, in a URL written by hand: `discord.com/api…`. A webhook's
 * own URL, `webhooks/{id}/{token}`, versioned or not, is left out:
 * discord.js's `WebhookClient({ url })` takes it. Its other routes (a bot's
 * `webhooks/{id}`, a message under the token) are reported. A `${}` (NUL)
 * stands for any one part. Hosts take any case: `Discord.com` is Discord too.
 */
const DISCORD_API_URL =
  /(?:^|[/.@])discord(?:app)?\.com\/api(?!(?:\/v(?:\d+|\0))?\/webhooks\/(?:\d+|\0)\/(?:[\w-]+|\0)(?:[?#]|$))(?:[/?#\0]|$)/i;

/** Whether `node` is a `Routes.x(…)` call: a route discord.js has. */
function isRoutesCall(node) {
  node = unwrap(node);
  return (
    node?.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    objectName(node.callee) === "Routes"
  );
}

/**
 * Whether a REST call's route reaches Discord: a `Routes` call, or a path
 * written by hand, which a key such as `"timeout"` is not. A full URL is left
 * to the URL check, reported once. A route held in a variable cannot be read
 * here: one from `Routes` is reported where it is made, a path written by hand
 * gets through.
 */
function isDiscordRoute(node) {
  if (isRoutesCall(node)) {
    return true;
  }
  const text = handText(node);
  return text !== null && text.includes("/") && !DISCORD_API_URL.test(text);
}

/** The route of a REST call, in its arguments or its `{ fullRoute }`. */
function restRoute(call) {
  const method = propertyName(call.callee);
  if (!isRest(call.callee.object)) {
    return null;
  }
  if (REST_METHODS.has(method)) {
    return call.arguments[0] ?? null;
  }
  const [options] = call.arguments;
  if (REST_REQUESTS.has(method) && options?.type === "ObjectExpression") {
    return (
      options.properties.find((p) => keyName(p) === "fullRoute")?.value ?? null
    );
  }
  return null;
}

/** Whether `node` is a REST client made on the spot: `new REST()…`. */
function isOwnRest(node) {
  node = unwrap(node);
  if (node?.type === "NewExpression") {
    return node.callee.type === "Identifier" && node.callee.name === "REST";
  }
  return (
    node?.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    isOwnRest(node.callee.object)
  );
}

/**
 * Whether `node` sits in something already reported, so the line is reported
 * once: a Discord API URL, or the nearest call around `node`, when it goes
 * through a client made on the spot or is a REST call with `node` in a route
 * reported.
 */
function inReportedCall(node) {
  const path = [node];
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (
      parent.type === "TemplateLiteral" &&
      DISCORD_API_URL.test(handText(parent))
    ) {
      // `https://discord.com/api${Routes.guild(id)}`: the URL is reported.
      return true;
    }
    if (parent.type === "CallExpression") {
      if (isOwnRest(parent)) {
        return true;
      }
      const route = restRoute(parent);
      return route !== null && path.includes(route) && isDiscordRoute(route);
    }
    path.push(parent);
  }
  return false;
}

/** A string in a type (`type Url = "…"`), which never reaches Discord. */
const inType = (node) => node.parent?.type === "TSLiteralType";

const discordRestInPolyfills = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Reach Discord through discord.js's methods; a call to its REST API, for what discord.js lacks, goes in src/lib/discord-polyfills/, to be deleted once discord.js ships it.",
    },
    messages: {
      polyfill:
        "Direct call to Discord's REST API: use discord.js's methods, or, for what they lack, a polyfill in src/lib/discord-polyfills/ with a test that fails once discord.js ships it.",
    },
    schema: [],
  },
  create(context) {
    const report = (node) => context.report({ node, messageId: "polyfill" });
    return {
      // `client.rest.get(Routes.guildMessagesSearch(id))`, a path written by
      // hand, or one put together with `+`. Without types, any `rest` with a
      // `get` looks the same: only a route is reported, not a key. A
      // `Routes` call is reported wherever it is, a route held in a variable
      // included: it only serves to reach the REST API.
      CallExpression(node) {
        const route = restRoute(node);
        if (
          (route && isDiscordRoute(route)) ||
          (isRoutesCall(node) && !inReportedCall(node))
        ) {
          report(node);
        }
      },
      // `new REST().setToken(token)`: a REST client of one's own, whose
      // calls the checks above cannot follow.
      NewExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "REST") {
          report(node);
        }
      },
      // `${RouteBases.api}/guilds/…`: the API's base URL, from discord.js.
      MemberExpression(node) {
        if (
          objectName(node) === "RouteBases" &&
          propertyName(node) === "api" &&
          !inReportedCall(node)
        ) {
          report(node);
        }
      },
      // `fetch("https://discord.com/api/v10/…")`, around discord.js.
      Literal(node) {
        if (
          typeof node.value === "string" &&
          !inType(node) &&
          DISCORD_API_URL.test(node.value)
        ) {
          report(node);
        }
      },
      TemplateLiteral(node) {
        if (DISCORD_API_URL.test(handText(node))) {
          report(node);
        }
      },
    };
  },
};

export default {
  meta: { name: "omnibot" },
  rules: {
    "no-whole-guild-member-fetch": noWholeGuildMemberFetch,
    "discord-rest-in-polyfills": discordRestInPolyfills,
  },
};
