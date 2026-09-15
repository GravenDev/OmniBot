# 🔍 Audit OmniBot

> Les items portent un ID stable `**#N**` (référencé par les commits, ex.
> « fixed in #24 »). Ils sont en **puces** à dessein : oxfmt renumérote les listes
> ordonnées markdown, ce qui corromprait ces identifiants. Les trous dans la
> numérotation sont volontaires et les IDs libérés ne sont **jamais réattribués**.
>
> **Ce fichier ne recense aucun sujet de sécurité.** Le dépôt est public : y
> décrire une faiblesse non corrigée revient à en publier le mode d'emploi. Ces
> sujets sont suivis hors dépôt.

🟠 Dépendances — réductions possibles

- **#4** — ~~winston-daily-rotate-file — mort~~ ✅ _already removed_
- **#5** — ~~prisma CLI dans dependencies → doit aller en devDependencies~~ ✅ _fixed in 178beab_
- **#6** — ~~dotenv — dépendance cachée~~ ✅ _removed in 1570454_
- **#7** — ~~winston — remplacé par pino~~ ✅ _fixed in 6271f8f_
- **#8** — ~~@prisma/client épinglé exactement vs prisma en ^6.14.0~~ ✅ _both on ^6.19.3_

---

🟡 Qualité de code

- **#9** — ~~// @ts-ignore dans service.ts~~ ✅ _fixed in 799b469 — remplacé par Object.assign_
- **#10** — ~~for (let ...) au lieu de for (const ...)~~ ✅ _fixed in bb5dffa_
- **#11** — ~~Double bloc JSDoc dans registry.ts~~ ✅ _fixed in c07d0d7_
- **#12** — ~~Méthodes dépréciées non supprimées~~ ✅ _fixed in 81f4eab_
- **#13** — EventListener<any> et InteractionHandler<any> dans Registry — any dans les tableaux internes. Bound unknown ou union plus précis seraient préférables.

---

🟠 Correctness (nouveau)

- **#18** — ~~Incohérence d'état dans les boutons enable/disable-module~~ ✅ _fixed in 9aea689_
- **#19** — ~~Rejets de promesses silencieux dans listener-loader.ts~~ ✅ _fixed in ad80b2e_
- **#20** — ~~`$` dans les remplacements regex — thread-creator.service.ts~~ ✅ _fixed in 7ae4e27_
- **#27** — Enum >25 options — troncature silencieuse. `EnumConfigHandler.buildSelectRow` borne les options à 25 (limite Discord d'un select) via `.slice(0, 25)`, sans log ni indication visuelle. Conséquences : les options 26+ sont non sélectionnables ; une valeur stockée au-delà de l'index 25 reste valide en base et s'affiche dans le panneau mais n'est plus re-sélectionnable dans l'éditeur ; et l'auteur du module n'a aucun retour que son enum est plafonné.
  - **Fix minimal** : `logger.warn` au moment du `slice` + documenter la limite de 25 dans `docs/specs/module-config.md`.
  - **Fix complet (si besoin réel)** : paginer le select lui-même (plusieurs menus / flux « plus d'options ») — disproportionné tant qu'aucun module n'a >25 choix.
  - **Déclencheur** : dès qu'un module déclare réellement un enum de plus de 25 options.

---

🟡 Qualité de code (nouveau)

- **#21** — ~~Logique dupliquée dans interaction-create.listener.ts~~ ✅ _fixed in 64ad497_
- **#22** — ~~Vérification de permission dupliquée entre enable/disable buttons~~ ✅ _fixed in ab336c5_

---

🔵 Architecture

- **#14** — Dépendances circulaires — module-installer.ts et module.service.ts importent tous deux { client, modules } depuis ../../index.js.
  - → Solution : context.ts. 🕐 _délayé — la circularité ESM fonctionne en pratique, à traiter lors d'une refonte plus large_
- **#16** — ~~Pas de graceful shutdown~~ ✅ _fixed in 48f44c9_
- **#17** — Script de consolidation Prisma potentiellement redondant — Prisma 6 supporte nativement les schémas multi-fichiers via glob. À investiguer lors d'une prochaine mise à jour Prisma.

---

🟣 Confort de développement (DX)

- **#23** — ~~Commandes du core enregistrées en global (~1 h de propagation, pénible en dev)~~ ✅ _fait : en `isDevMode()`, enregistrement sur `DEV_GUILD_ID` (instantané) ; global conservé en prod_
- **#24** — ~~Imports verbeux/fragiles : remontée `../../..`~~ ✅ _fait : subpath imports natifs `#*` (`package.json` "imports" → `./src` en dev/test/typecheck via la condition `development` ; `./dist` en prod par défaut). Aucune dep, aucune étape de build (Node résout `#*` au runtime, tsc/tsx/vitest via conditions). Les remontées `../` sont réécrites en `#…` ; les `./` même-dossier restent relatifs._
  - **Reste hors périmètre** : la suppression du suffixe `.js` (NodeNext l'impose) nécessiterait un bundler ou `moduleResolution: "Bundler"` — non poursuivi.
- **#25** — ~~Gate de version inadapté en dev pour les commandes de module~~ ✅ _fait : en `isDevMode()`, `loadDevGuildCommands` enregistre core + commandes des modules activés en un seul PUT sur la dev guild à chaque boot (sans bump de version) ; gate par version conservé en prod_
- **#28** — ~~CI : remplacer le grep de version Node par `jdx/mise-action`~~ 🚫 _non retenu (décidé)_. L'idée : `mise install` en une étape à la place de `pnpm/action-setup` + `grep '^node = ' .mise.toml` + `setup-node`. **Raisons du refus** : (1) perte du cache pnpm automatique fourni par `setup-node` (`cache: pnpm`) — il faudrait le re-câbler à la main (cf. #32) ; (2) `mise install` installerait aussi des outils inutiles en CI (pitchfork…) ; (3) le grep actuel, bien que peu élégant, est explicite et fonctionne. Le ratio bénéfice/inconvénient n'est pas favorable. (`docs.yml` garde `mise-action` car le build docs est peu fréquent et non sensible à ces points.)
- **#30** — `pnpm dev` ne fait pas de hot-reload alors que `CLAUDE.md` annonce « tsx watch » : le script est `node --import tsx src/index.ts` (sans `watch`). À réconcilier (passer le script en `tsx watch`, ou corriger la doc).
- **#31** — Docs VitePress : logo manquant. Le hero de `docs/site/index.md` référençait `/logo.svg`, absent de `docs/site/public/` (image 404 sur le site publié). La référence `image:` a été retirée temporairement. À rétablir une fois qu'un logo existe : ajouter `docs/site/public/logo.svg` puis remettre le bloc `image: { src: /logo.svg, alt: OmniBot }` dans le frontmatter du hero.
- **#32** — CI docs : pas de cache du store pnpm. `docs.yml` utilise `jdx/mise-action` (qui ne cache que les outils, pas le store pnpm), contrairement à `ci.yml` qui bénéficie de `cache: pnpm` via `setup-node`. Le workflow ne tournant que sur changements de `docs/`, le ROI est faible — délayé. À traiter si le build docs devient lent : ajouter un `actions/cache` sur `pnpm store path` (clé sur `hashFiles('pnpm-lock.yaml')`), ou activer le cache pnpm de `mise-action`.
- **#33** — Docs VitePress : la home racine `docs/site/index.md` est entièrement en français (hero + features). **Décidé** : chaque locale est autonome — la nav `Accueil`/`Home` pointe désormais vers `/fr/` et `/en/` (et plus vers `/`), donc la racine `/` n'est plus qu'un point d'entrée rarement visité. Priorité **rétrogradée** : la bilinguiser/neutraliser devient optionnel ; alternative possible : la réduire à une simple redirection vers la locale par défaut.
- **#34** — CI : `permissions: contents: read` est répété à l'identique dans les jobs `lint` et `build` de `ci.yml`. Pourrait remonter au niveau workflow (top-level) pour éviter la duplication. Cosmétique / moindre privilège.
- **#35** — CI (_incertain_) : le bloc de setup (checkout + `pnpm/action-setup` + lecture version Node + `setup-node`) est dupliqué à l'identique entre `lint` et `build`. Factorisation possible **via ancres YAML** (privilégié), mais les ancres ne savent pas concaténer une séquence de steps + des steps supplémentaires ; l'alternative propre est une **composite action** `.github/actions/setup` — dont la complexité induite reste à valider pour seulement 2 jobs.
- **#36** — CI (_incertain_) : incohérence d'install entre `lint` (`pnpm ci`) et `build` (`pnpm install --frozen-lockfile`). Uniformiser, mais **vérifié** : sans filtre, `pnpm ci` comme `pnpm install` font un (clean-)install de **tout le workspace**, vitepress (dép. d'`omnibot-docs`) compris — inutile pour linter/builder/tester le bot. Le vrai gain serait de **scoper l'install CI au paquet du bot** (filtre excluant `docs/site`) plutôt que de choisir `ci` vs `install`. `pnpm ci` n'aide pas sur ce point (il ignore `--filter`, cf. essais docs).

---

🟢 Points positifs

- Toolchain moderne : oxlint + oxfmt (Rust-based) → rapide et peu verbeux
- TypeScript strict : noUncheckedIndexedAccess, exactOptionalPropertyTypes, verbatimModuleSyntax — configuration exemplaire
- Renovate configuré avec automerge, minimumReleaseAge, platformAutomerge, digest pinning GitHub Actions
- .mise.toml pour épingler Node.js et pnpm — reproductibilité garantie
- Validation des vars d'env au démarrage propre et failfast
- Architecture modulaire bien pensée (Registry, Module, Declared) — extensible
- lefthook + commitlint — hooks git et convention de commits enforced
- pino : logging léger et performant

---

Récapitulatif des actions restantes

| Priorité | Action                                                    |
| -------- | --------------------------------------------------------- |
| 🔵       | Extraire client/modules dans un context.ts (#14) — délayé |
| 🟠       | Enum >25 options : warn + doc (#27)                       |
| 🟣       | `pnpm dev` : hot-reload vs doc (#30)                      |
| 🟢       | Docs : ajouter un logo + rétablir le hero image (#31)     |
| 🟢       | CI docs : cache du store pnpm (#32) — délayé              |
| 🟢       | Docs : home racine FR-only (#33) — optionnel              |
| 🟢       | CI : `permissions` au niveau workflow (#34)               |
| 🟢       | CI : factoriser le setup dupliqué (#35) — incertain       |
| 🟢       | CI : uniformiser/scoper l'install (#36) — incertain       |
