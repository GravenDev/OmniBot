import { defineConfig } from "vitepress";

// VitePress requires `base` to start and end with a slash; normalize whatever
// DOCS_BASE provides so an override like `/OmniBot` doesn't break routing/assets.
const rawBase = process.env["DOCS_BASE"] ?? "/OmniBot/";
const trimmed = rawBase.replace(/^\/+|\/+$/g, "");
const base = trimmed ? `/${trimmed}/` : "/";

export default defineConfig({
  base,

  title: "OmniBot",
  description: "Documentation du bot Discord modulaire OmniBot",

  srcExclude: ["README.md"],

  cleanUrls: true,

  themeConfig: {
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
        ],
        sidebar: {
          "/fr/guide/": [
            {
              text: "Guide",
              items: [
                { text: "Pour commencer", link: "/fr/guide/getting-started" },
                {
                  text: "Créer un module",
                  link: "/fr/guide/creating-a-module",
                },
                { text: "Commandes", link: "/fr/guide/commands" },
                { text: "Écouteurs", link: "/fr/guide/listeners" },
                { text: "Interactions", link: "/fr/guide/interactions" },
                { text: "Configuration", link: "/fr/guide/configuration" },
                { text: "Services", link: "/fr/guide/services" },
                { text: "Base de données", link: "/fr/guide/database" },
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
          { text: "Home", link: "/en/" },
        ],
        sidebar: {
          "/en/guide/": [
            {
              text: "Guide",
              items: [
                { text: "Getting Started", link: "/en/guide/getting-started" },
                {
                  text: "Creating a Module",
                  link: "/en/guide/creating-a-module",
                },
                { text: "Commands", link: "/en/guide/commands" },
                { text: "Listeners", link: "/en/guide/listeners" },
                { text: "Interactions", link: "/en/guide/interactions" },
                { text: "Configuration", link: "/en/guide/configuration" },
                { text: "Services", link: "/en/guide/services" },
                { text: "Database", link: "/en/guide/database" },
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
