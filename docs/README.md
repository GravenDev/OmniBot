# Documentation OmniBot

La documentation a été migrée vers [VitePress](https://vitepress.dev/).

Pour lancer le serveur de documentation en local :

```bash
pnpm --filter docs dev
```

Pour construire la version statique :

```bash
pnpm --filter docs build
```

Les sources sont organisées dans `docs/` :

- `en/` — Documentation en anglais
- `fr/` — Documentation en français
- `_internal/` — Anciens fichiers et spécifications internes

> L'ancienne documentation markdown simple a été déplacée dans `docs/_internal/`.
