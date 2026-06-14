# Documentation OmniBot

La documentation a été migrée vers [VitePress](https://vitepress.dev/).

Pour lancer le serveur de documentation en local :

```bash
pnpm --filter omnibot-docs dev
```

Pour construire la version statique :

```bash
pnpm --filter omnibot-docs build
```

Les sources du site sont organisées dans `docs/site/` :

- `en/` — Documentation en anglais
- `fr/` — Documentation en français

> Les anciennes notes internes (spécifications, revues, comportement
> fonctionnel) restent en markdown simple dans `docs/` (`functional.md`,
> `specs/`, `review/`).
