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
- **#13** — ~~`any` dans le Registry~~ 🚫 _non retenu (décidé)_. Le Registry stocke des handlers hétérogènes dont le paramètre `config` est contravariant : ni `unknown` ni `ConfigSchema` ne sont assignables sans un `as unknown as`, qui ne vaut pas mieux. Le `any` est cantonné aux champs privés et à un cast dans `register`.

---

🟠 Correctness (nouveau)

- **#18** — ~~Incohérence d'état dans les boutons enable/disable-module~~ ✅ _fixed in 9aea689_
- **#19** — ~~Rejets de promesses silencieux dans listener-loader.ts~~ ✅ _fixed in ad80b2e_
- **#20** — ~~`$` dans les remplacements regex — thread-creator.service.ts~~ ✅ _fixed in 7ae4e27_
- **#27** — ~~Enum >25 options — troncature silencieuse~~ ✅ _fait : `findTruncatedEnums` dans `module-loader.ts` émet un `logger.warn` au chargement du module ; `MAX_SELECT_VALUES` vit désormais dans `#lib/config.js` ; limite documentée dans `docs/specs/module-config.md`. La pagination du select reste hors périmètre tant qu'aucun module n'en a besoin._

---

🟡 Qualité de code (nouveau)

- **#21** — ~~Logique dupliquée dans interaction-create.listener.ts~~ ✅ _fixed in 64ad497_
- **#22** — ~~Vérification de permission dupliquée entre enable/disable buttons~~ ✅ _fixed in ab336c5_

---

🔵 Architecture

- **#14** — ~~Dépendances circulaires vers `index.js`~~ ✅ _fait : `client` et `modules` vivent dans `src/core/context.ts` (sans effet de bord à l'import) ; `index.ts` les alimente. Les tests n'ont plus besoin de mocker `#index.js` pour éviter de démarrer le bot._
- **#16** — ~~Pas de graceful shutdown~~ ✅ _fixed in 48f44c9_
- **#17** — ~~Script de consolidation Prisma potentiellement redondant~~ 🚫 _non retenu (investigué)_. `prisma.config.ts` utilise déjà le mode multi-fichiers sur `src/prisma`, mais les `.prisma` des modules vivent dans `src/modules/*/`. Pointer Prisma sur `src/` ramasserait aussi `src/generated/prisma/schema.prisma` (copie émise par `prisma generate`) ; garder les schémas à côté de leur module suppose donc la consolidation.

---

🟣 Confort de développement (DX)

- **#23** — ~~Commandes du core enregistrées en global (~1 h de propagation, pénible en dev)~~ ✅ _fait : en `isDevMode()`, enregistrement sur `DEV_GUILD_ID` (instantané) ; global conservé en prod_
- **#24** — ~~Imports verbeux/fragiles : remontée `../../..`~~ ✅ _fait : subpath imports natifs `#*` (`package.json` "imports" → `./src` en dev/test/typecheck via la condition `development` ; `./dist` en prod par défaut). Aucune dep, aucune étape de build (Node résout `#*` au runtime, tsc/tsx/vitest via conditions). Les remontées `../` sont réécrites en `#…` ; les `./` même-dossier restent relatifs._
  - **Reste hors périmètre** : la suppression du suffixe `.js` (NodeNext l'impose) nécessiterait un bundler ou `moduleResolution: "Bundler"` — non poursuivi.
- **#25** — ~~Gate de version inadapté en dev pour les commandes de module~~ ✅ _fait : en `isDevMode()`, `loadDevGuildCommands` enregistre core + commandes des modules activés en un seul PUT sur la dev guild à chaque boot (sans bump de version) ; gate par version conservé en prod_
- **#28** — ~~CI : remplacer le grep de version Node par `jdx/mise-action`~~ 🚫 _non retenu (décidé)_. L'idée : `mise install` en une étape à la place de `pnpm/action-setup` + `grep '^node = ' .mise.toml` + `setup-node`. **Raisons du refus** : (1) perte du cache pnpm automatique fourni par `setup-node` (`cache: pnpm`) — il faudrait le re-câbler à la main (cf. #32) ; (2) `mise install` installerait aussi des outils inutiles en CI (pitchfork…) ; (3) le grep actuel, bien que peu élégant, est explicite et fonctionne. Le ratio bénéfice/inconvénient n'est pas favorable. (`docs.yml` garde `mise-action` car le build docs est peu fréquent et non sensible à ces points.)
- **#30** — ~~`pnpm dev` sans hot-reload alors que la doc annonce « tsx watch »~~ ✅ _clos : la doc n'annonce plus de watch. Un `tsx watch` relancerait la connexion gateway et la resynchronisation des commandes de la dev guild à chaque sauvegarde ; non adopté._
- **#31** — ~~Docs VitePress : logo manquant~~ ✅ _fait : mascotte redessinée en SVG dans `docs/site/public/logo.svg` (hero FR/EN, barre de navigation, favicon)._
- **#32** — ~~CI docs : pas de cache du store pnpm~~ ✅ _fait : `docs.yml` passe par l'action composite `.github/actions/setup` (paramètre `package: omnibot-docs`), donc par `setup-node` et son `cache: pnpm`._
- **#33** — ~~Docs VitePress : home racine FR-only~~ ✅ _fait : `docs/site/index.md` redirige vers `/fr/`, avec des liens FR/EN en repli._
- **#34** — ~~CI : `permissions` répété dans chaque job~~ ✅ _fait : `contents: read` au niveau workflow ; seuls `publish` et `deploy` gardent leurs permissions propres._
- **#35** — ~~CI : setup dupliqué entre `lint` et `build`~~ ✅ _fait : action composite `.github/actions/setup` (pnpm, Node lu dans `.mise.toml`, `setup-node` avec cache, install)._
- **#36** — ~~CI : install incohérente et non scopée~~ ✅ _fait : `pnpm install --frozen-lockfile --filter omni-bot` dans les deux jobs (vérifié : tous les outils du bot, sans vitepress)._

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

Aucune action restante.
