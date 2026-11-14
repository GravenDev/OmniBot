import { defineConfig } from "vitepress";

// VitePress requires `base` to start and end with a slash; normalize whatever
// DOCS_BASE provides so an override like `/OmniBot` doesn't break routing/assets.
const rawBase = process.env["DOCS_BASE"] ?? "/OmniBot/";
const trimmed = rawBase.replace(/^\/+|\/+$/g, "");
const base = trimmed ? `/${trimmed}/` : "/";
// Where GitHub Pages publishes the site; DOCS_SITE_URL overrides it (with its
// scheme). Its trailing slashes are dropped, as `base` brings the next one.
const SITE_URL = (
  process.env["DOCS_SITE_URL"] ?? "https://gravendev.github.io"
).replace(/\/+$/, "");

export default defineConfig({
  base,

  title: "OmniBot",
  description: "Documentation du bot Discord modulaire OmniBot",

  srcExclude: ["README.md"],

  cleanUrls: true,

  head: [
    [
      "link",
      { rel: "icon", type: "image/svg+xml", href: `${base}favicon.svg` },
    ],
    // The card shown when a link to the site is shared (Discord, social
    // networks): its image needs an absolute URL.
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: "OmniBot" }],
    [
      "meta",
      { property: "og:image", content: `${SITE_URL}${base}og-image.png` },
    ],
    ["meta", { property: "og:image:width", content: "1200" }],
    ["meta", { property: "og:image:height", content: "630" }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
  ],

  themeConfig: {
    // The robot's head is white on the dark theme, outlined in navy on the
    // light one.
    logo: { light: "/logo-light.svg", dark: "/logo.svg" },
    // "Bot" in cyan, as on the home page and in the logo's wordmark.
    siteTitle: 'Omni<span class="accent">Bot</span>',
    search: {
      provider: "local",
    },
  },

  locales: {
    fr: {
      label: "Français",
      lang: "fr",
      link: "/fr/",
      title: "OmniBot",
      description: "Documentation du bot Discord modulaire OmniBot",
      themeConfig: {
        nav: [
          { text: "Accueil", link: "/fr/" },
          { text: "Guide", link: "/fr/guide/getting-started" },
          { text: "Utiliser le bot", link: "/fr/usage/reference/modules/" },
        ],
        sidebar: {
          "/fr/usage/": [
            {
              text: "Référence",
              items: [
                { text: "Commandes du bot", link: "/fr/usage/reference/core" },
                {
                  text: "Liste des modules",
                  link: "/fr/usage/reference/modules/",
                },
                {
                  text: "Ancienneté",
                  link: "/fr/usage/reference/modules/seniority",
                },
                {
                  text: "Anniversaires",
                  link: "/fr/usage/reference/modules/birthday",
                },
                {
                  text: "Citation de messages",
                  link: "/fr/usage/reference/modules/message-quote",
                },
                {
                  text: "Clash of Code",
                  link: "/fr/usage/reference/modules/clash-of-code",
                },
                {
                  text: "Création de fils",
                  link: "/fr/usage/reference/modules/thread-creator",
                },
                {
                  text: "Honeypot",
                  link: "/fr/usage/reference/modules/honeypot",
                },
                {
                  text: "Jeu des 4h",
                  link: "/fr/usage/reference/modules/four-hour-game",
                },
                {
                  text: "Journal des messages",
                  link: "/fr/usage/reference/modules/message-log",
                },
                { text: "LaTeX", link: "/fr/usage/reference/modules/latex" },
                {
                  text: "Messages collants",
                  link: "/fr/usage/reference/modules/sticky",
                },
                {
                  text: "Réactions automatiques",
                  link: "/fr/usage/reference/modules/autoreact",
                },
                { text: "RNGdle", link: "/fr/usage/reference/modules/rngdle" },
                {
                  text: "Salons vocaux temporaires",
                  link: "/fr/usage/reference/modules/temp-voice",
                },
                {
                  text: "Signalements",
                  link: "/fr/usage/reference/modules/reports",
                },
                {
                  text: "Starboard",
                  link: "/fr/usage/reference/modules/starboard",
                },
                {
                  text: "Statistiques du serveur",
                  link: "/fr/usage/reference/modules/server-stats",
                },
              ],
            },
          ],
          "/fr/guide/": [
            {
              text: "Guide",
              items: [
                { text: "Pour commencer", link: "/fr/guide/getting-started" },
                { text: "Architecture", link: "/fr/guide/architecture" },
                {
                  text: "Créer un module",
                  link: "/fr/guide/creating-a-module",
                },
                { text: "Commandes", link: "/fr/guide/commands" },
                { text: "Écouteurs", link: "/fr/guide/listeners" },
                { text: "Interactions", link: "/fr/guide/interactions" },
                { text: "Configuration", link: "/fr/guide/configuration" },
                { text: "Localisation", link: "/fr/guide/localisation" },
                { text: "Services", link: "/fr/guide/services" },
                { text: "Tâches planifiées", link: "/fr/guide/tasks" },
                { text: "Images", link: "/fr/guide/images" },
                { text: "Base de données", link: "/fr/guide/database" },
                { text: "Contribuer", link: "/fr/guide/contributing" },
              ],
            },
            {
              text: "Juridique",
              items: [
                { text: "Confidentialité", link: "/fr/legal/privacy" },
                { text: "CGU", link: "/fr/legal/terms" },
              ],
            },
          ],
        },
        outline: {
          label: "Sur cette page",
        },
        returnToTopLabel: "Retour en haut",
        sidebarMenuLabel: "Menu",
        darkModeSwitchLabel: "Apparence",
        lightModeSwitchTitle: "Passer en mode clair",
        darkModeSwitchTitle: "Passer en mode sombre",
        docFooter: {
          prev: "Page précédente",
          next: "Page suivante",
        },
      },
    },
    en: {
      label: "English",
      lang: "en",
      link: "/en/",
      title: "OmniBot",
      description: "OmniBot modular Discord bot documentation",
      themeConfig: {
        nav: [
          { text: "Guide", link: "/en/guide/getting-started" },
          { text: "Using the bot", link: "/en/usage/reference/modules/" },
          { text: "Home", link: "/en/" },
        ],
        sidebar: {
          "/en/usage/": [
            {
              text: "Reference",
              items: [
                { text: "Bot commands", link: "/en/usage/reference/core" },
                {
                  text: "List of modules",
                  link: "/en/usage/reference/modules/",
                },
                {
                  text: "4h Game",
                  link: "/en/usage/reference/modules/four-hour-game",
                },
                {
                  text: "Auto React",
                  link: "/en/usage/reference/modules/autoreact",
                },
                {
                  text: "Birthdays",
                  link: "/en/usage/reference/modules/birthday",
                },
                {
                  text: "Clash of Code",
                  link: "/en/usage/reference/modules/clash-of-code",
                },
                {
                  text: "Honeypot",
                  link: "/en/usage/reference/modules/honeypot",
                },
                { text: "LaTeX", link: "/en/usage/reference/modules/latex" },
                {
                  text: "Member anniversaries",
                  link: "/en/usage/reference/modules/seniority",
                },
                {
                  text: "Message Log",
                  link: "/en/usage/reference/modules/message-log",
                },
                {
                  text: "Message Quote",
                  link: "/en/usage/reference/modules/message-quote",
                },
                {
                  text: "Reports",
                  link: "/en/usage/reference/modules/reports",
                },
                { text: "RNGdle", link: "/en/usage/reference/modules/rngdle" },
                {
                  text: "Server Stats",
                  link: "/en/usage/reference/modules/server-stats",
                },
                {
                  text: "Starboard",
                  link: "/en/usage/reference/modules/starboard",
                },
                {
                  text: "Sticky Messages",
                  link: "/en/usage/reference/modules/sticky",
                },
                {
                  text: "Temporary Voice Channels",
                  link: "/en/usage/reference/modules/temp-voice",
                },
                {
                  text: "Thread Creator",
                  link: "/en/usage/reference/modules/thread-creator",
                },
              ],
            },
          ],
          "/en/guide/": [
            {
              text: "Guide",
              items: [
                { text: "Getting Started", link: "/en/guide/getting-started" },
                { text: "Architecture", link: "/en/guide/architecture" },
                {
                  text: "Creating a Module",
                  link: "/en/guide/creating-a-module",
                },
                { text: "Commands", link: "/en/guide/commands" },
                { text: "Listeners", link: "/en/guide/listeners" },
                { text: "Interactions", link: "/en/guide/interactions" },
                { text: "Configuration", link: "/en/guide/configuration" },
                { text: "Localization", link: "/en/guide/localization" },
                { text: "Services", link: "/en/guide/services" },
                { text: "Scheduled Tasks", link: "/en/guide/tasks" },
                { text: "Images", link: "/en/guide/images" },
                { text: "Database", link: "/en/guide/database" },
                { text: "Contributing", link: "/en/guide/contributing" },
              ],
            },
            {
              text: "Legal",
              items: [
                { text: "Privacy", link: "/en/legal/privacy" },
                { text: "Terms", link: "/en/legal/terms" },
              ],
            },
          ],
        },
        outline: {
          label: "On this page",
        },
        returnToTopLabel: "Return to top",
        sidebarMenuLabel: "Menu",
        darkModeSwitchLabel: "Appearance",
        lightModeSwitchTitle: "Switch to light mode",
        darkModeSwitchTitle: "Switch to dark mode",
        docFooter: {
          prev: "Previous page",
          next: "Next page",
        },
      },
    },
  },
});
