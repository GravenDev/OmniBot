import { defineConfig } from "vitepress";

const base = process.env["DOCS_BASE"] ?? "/OmniBot/";

export default defineConfig({
  base,

  title: "OmniBot",
  description: "Documentation du bot Discord modulaire OmniBot",

  srcExclude: [
    "README.md",
    "functional.md",
    "modules.md",
    "commands.md",
    "listeners.md",
    "interactions.md",
    "services.md",
    "prisma.md",
    "specs/**",
    "review/**",
    "_internal/**",
  ],

  cleanUrls: true,

  themeConfig: {
    search: {
      provider: "local",
    },
  },

  locales: {
    root: {
      label: "Français",
      lang: "fr",
      link: "/",
      title: "OmniBot",
      description: "Documentation du bot Discord modulaire OmniBot",
      themeConfig: {
        nav: [
          { text: "Guide", link: "/fr/guide/getting-started" },
          { text: "Modules", link: "/fr/guide/creating-a-module" },
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
          { text: "Modules", link: "/en/guide/creating-a-module" },
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
