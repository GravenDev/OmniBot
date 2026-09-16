# 🧰 Backlog technique d'OmniBot

Le backlog **technique** d'OmniBot. Il est né d'un audit ponctuel — d'où les IDs
et le ton de certaines entrées — mais c'est aujourd'hui une liste vivante.

## Ce qui va ailleurs

| Sujet                                                     | Où                                                                |
| --------------------------------------------------------- | ----------------------------------------------------------------- |
| Backlog **fonctionnel**, bugs visibles par un utilisateur | les issues GitHub                                                 |
| Décisions prises ou refusées                              | ADR / PDR — à mettre en place, `TASK-28` et `TASK-33` y partiront |
| **Sécurité**                                              | nulle part dans le dépôt                                          |

La sécurité n'y figure pas par principe : le dépôt est public, et décrire une
faiblesse non corrigée revient à en publier le mode d'emploi. Ces sujets sont
suivis hors dépôt.

Les corvées ont vocation à rejoindre les issues — elles sont courtes et
assignables, ce qu'un markdown rend mal. Elles restent ici pour l'instant.

## Conventions

**Les étiquettes** disent la nature d'un item, pas sa priorité. Elles sont
modifiables : une étude qui conclut à un vrai problème devient de la dette.

| Étiquette       | Sens                                                             |
| --------------- | ---------------------------------------------------------------- |
| 🧱 `[debt]`     | du code qui fonctionne mais ne devrait pas rester                |
| 🔬 `[study]`    | une question ouverte — on ne sait pas encore s'il y a du travail |
| 🧹 `[chore]`    | une corvée d'outillage, sans impact sur le produit               |
| 📐 `[decision]` | un choix acté ou refusé, en attente de migration en ADR/PDR      |

**Les identifiants** sont stables et référencés par les commits (ex. « fixed in
TASK-24 »). `TASK-` préfixe **tous** les items quelle que soit leur étiquette :
c'est un espace de noms, pas une catégorie. Il évite que GitHub n'autolie `TASK-24`
vers l'issue du même numéro.

Les items sont en **puces** à dessein : oxfmt renumérote les listes ordonnées
markdown, ce qui corromprait les identifiants. Les trous dans la numérotation
sont volontaires et les IDs libérés ne sont **jamais réattribués** : les IDs 1 à
3, 15, 26 et 29 ont existé ici et n'y sont plus.

🟠 Dépendances — réductions possibles

- **TASK-4** — ~~winston-daily-rotate-file — mort~~ ✅ _already removed_
- **TASK-5** — ~~prisma CLI dans dependencies → doit aller en devDependencies~~ ✅ _fixed in 178beab_
- **TASK-6** — ~~dotenv — dépendance cachée~~ ✅ _removed in 1570454_
- **TASK-7** — ~~winston — remplacé par pino~~ ✅ _fixed in 6271f8f_
- **TASK-8** — ~~@prisma/client épinglé exactement vs prisma en ^6.14.0~~ ✅ _both on ^6.19.3_

---

🟡 Qualité de code

- **TASK-9** — ~~// @ts-ignore dans service.ts~~ ✅ _fixed in 799b469 — remplacé par Object.assign_
- **TASK-10** — ~~for (let ...) au lieu de for (const ...)~~ ✅ _fixed in bb5dffa_
- **TASK-11** — ~~Double bloc JSDoc dans registry.ts~~ ✅ _fixed in c07d0d7_
- **TASK-12** — ~~Méthodes dépréciées non supprimées~~ ✅ _fixed in 81f4eab_
- **TASK-13** 🧱 `[debt]` — EventListener<any> et InteractionHandler<any> dans Registry — any dans les tableaux internes. Bound unknown ou union plus précis seraient préférables.

---

🟠 Correctness (nouveau)

- **TASK-18** — ~~Incohérence d'état dans les boutons enable/disable-module~~ ✅ _fixed in 9aea689_
- **TASK-19** — ~~Rejets de promesses silencieux dans listener-loader.ts~~ ✅ _fixed in ad80b2e_
- **TASK-20** — ~~`$` dans les remplacements regex — thread-creator.service.ts~~ ✅ _fixed in 7ae4e27_
- **TASK-27** 🧱 `[debt]` — Enum >25 options — troncature silencieuse. `EnumConfigHandler.buildSelectRow` borne les options à 25 (limite Discord d'un select) via `.slice(0, 25)`, sans log ni indication visuelle. Conséquences : les options 26+ sont non sélectionnables ; une valeur stockée au-delà de l'index 25 reste valide en base et s'affiche dans le panneau mais n'est plus re-sélectionnable dans l'éditeur ; et l'auteur du module n'a aucun retour que son enum est plafonné.
  - **Fix minimal** : `logger.warn` au moment du `slice` + documenter la limite de 25 dans `docs/specs/module-config.md`.
  - **Fix complet (si besoin réel)** : paginer le select lui-même (plusieurs menus / flux « plus d'options ») — disproportionné tant qu'aucun module n'a >25 choix.
  - **Déclencheur** : dès qu'un module déclare réellement un enum de plus de 25 options.

---

🟡 Qualité de code (nouveau)

- **TASK-21** — ~~Logique dupliquée dans interaction-create.listener.ts~~ ✅ _fixed in 64ad497_
- **TASK-22** — ~~Vérification de permission dupliquée entre enable/disable buttons~~ ✅ _fixed in ab336c5_

---

🔵 Architecture

- **TASK-14** 🧱 `[debt]` — Dépendances circulaires — module-installer.ts et module.service.ts importent tous deux { client, modules } depuis ../../index.js.
  - → Solution : context.ts. 🕐 _délayé — la circularité ESM fonctionne en pratique, à traiter lors d'une refonte plus large_
- **TASK-16** — ~~Pas de graceful shutdown~~ ✅ _fixed in 48f44c9_
- **TASK-37** 🧱 `[debt]` — `MessageContent` — intent privilégié mal amorti. `thread-creator` demande `GatewayIntentBits.MessageContent`, un des trois intents **privilégiés** de Discord, activé dans le Developer Portal après le crash `Used disallowed intents` en production. Or son unique usage est la variable `{messageContent}` du template de nom de fil (`thread-creator.service.ts`), que le template par défaut (`Discussion - {messageAuthor}`) n'utilise même pas. On demande donc l'accès au contenu de tous les messages pour un cas d'usage marginal.
  - **Deux issues** : soit en faire quelque chose qui le justifie (un module qui lit réellement le contenu), soit **retirer l'intent** et la variable de template avec lui.
  - **Déclencheur** : avant toute diffusion large. L'intent reste gratuit sous 100 serveurs, mais au-delà il faut une demande d'approbation à Discord — qu'on aurait du mal à défendre en l'état.

- **TASK-17** 🔬 `[study]` — Script de consolidation Prisma potentiellement redondant — Prisma 6 supporte nativement les schémas multi-fichiers via glob. À investiguer lors d'une prochaine mise à jour Prisma.

---

🟣 Confort de développement (DX)

- **TASK-23** — ~~Commandes du core enregistrées en global (~1 h de propagation, pénible en dev)~~ ✅ _fait : en `isDevMode()`, enregistrement sur `DEV_GUILD_ID` (instantané) ; global conservé en prod_
- **TASK-24** — ~~Imports verbeux/fragiles : remontée `../../..`~~ ✅ _fait : subpath imports natifs `#*` (`package.json` "imports" → `./src` en dev/test/typecheck via la condition `development` ; `./dist` en prod par défaut). Aucune dep, aucune étape de build (Node résout `#*` au runtime, tsc/tsx/vitest via conditions). Les remontées `../` sont réécrites en `#…` ; les `./` même-dossier restent relatifs._
  - **Reste hors périmètre** : la suppression du suffixe `.js` (NodeNext l'impose) nécessiterait un bundler ou `moduleResolution: "Bundler"` — non poursuivi.
- **TASK-25** — ~~Gate de version inadapté en dev pour les commandes de module~~ ✅ _fait : en `isDevMode()`, `loadDevGuildCommands` enregistre core + commandes des modules activés en un seul PUT sur la dev guild à chaque boot (sans bump de version) ; gate par version conservé en prod_
- **TASK-28** 📐 `[decision]` — ~~CI : remplacer le grep de version Node par `jdx/mise-action`~~ 🚫 _non retenu (décidé)_. L'idée : `mise install` en une étape à la place de `pnpm/action-setup` + `grep '^node = ' .mise.toml` + `setup-node`. **Raisons du refus** : (1) perte du cache pnpm automatique fourni par `setup-node` (`cache: pnpm`) — il faudrait le re-câbler à la main (cf. TASK-32) ; (2) `mise install` installerait aussi des outils inutiles en CI (pitchfork…) ; (3) le grep actuel, bien que peu élégant, est explicite et fonctionne. Le ratio bénéfice/inconvénient n'est pas favorable. (`docs.yml` garde `mise-action` car le build docs est peu fréquent et non sensible à ces points.)
- **TASK-30** 🧹 `[chore]` — `pnpm dev` ne fait pas de hot-reload alors que `CLAUDE.md` annonce « tsx watch » : le script est `node --import tsx src/index.ts` (sans `watch`). À réconcilier (passer le script en `tsx watch`, ou corriger la doc).
- **TASK-31** 🧹 `[chore]` — Docs VitePress : logo manquant. Le hero de `docs/site/index.md` référençait `/logo.svg`, absent de `docs/site/public/` (image 404 sur le site publié). La référence `image:` a été retirée temporairement. À rétablir une fois qu'un logo existe : ajouter `docs/site/public/logo.svg` puis remettre le bloc `image: { src: /logo.svg, alt: OmniBot }` dans le frontmatter du hero.
- **TASK-32** 🧹 `[chore]` — CI docs : pas de cache du store pnpm. `docs.yml` utilise `jdx/mise-action` (qui ne cache que les outils, pas le store pnpm), contrairement à `ci.yml` qui bénéficie de `cache: pnpm` via `setup-node`. Le workflow ne tournant que sur changements de `docs/`, le ROI est faible — délayé. À traiter si le build docs devient lent : ajouter un `actions/cache` sur `pnpm store path` (clé sur `hashFiles('pnpm-lock.yaml')`), ou activer le cache pnpm de `mise-action`.
- **TASK-33** 📐 `[decision]` — Docs VitePress : la home racine `docs/site/index.md` est entièrement en français (hero + features). **Décidé** : chaque locale est autonome — la nav `Accueil`/`Home` pointe désormais vers `/fr/` et `/en/` (et plus vers `/`), donc la racine `/` n'est plus qu'un point d'entrée rarement visité. Priorité **rétrogradée** : la bilinguiser/neutraliser devient optionnel ; alternative possible : la réduire à une simple redirection vers la locale par défaut.
- **TASK-34** 🧹 `[chore]` — CI : `permissions: contents: read` est répété à l'identique dans les jobs `lint` et `build` de `ci.yml`. Pourrait remonter au niveau workflow (top-level) pour éviter la duplication. Cosmétique / moindre privilège.
- **TASK-35** 🧹 `[chore]` — CI (_incertain_) : le bloc de setup (checkout + `pnpm/action-setup` + lecture version Node + `setup-node`) est dupliqué à l'identique entre `lint` et `build`. Factorisation possible **via ancres YAML** (privilégié), mais les ancres ne savent pas concaténer une séquence de steps + des steps supplémentaires ; l'alternative propre est une **composite action** `.github/actions/setup` — dont la complexité induite reste à valider pour seulement 2 jobs.
- **TASK-36** 🧹 `[chore]` — CI (_incertain_) : incohérence d'install entre `lint` (`pnpm ci`) et `build` (`pnpm install --frozen-lockfile`). Uniformiser, mais **vérifié** : sans filtre, `pnpm ci` comme `pnpm install` font un (clean-)install de **tout le workspace**, vitepress (dép. d'`omnibot-docs`) compris — inutile pour linter/builder/tester le bot. Le vrai gain serait de **scoper l'install CI au paquet du bot** (filtre excluant `docs/site`) plutôt que de choisir `ci` vs `install`. `pnpm ci` n'aide pas sur ce point (il ignore `--filter`, cf. essais docs).

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

| Priorité | Action                                                        |
| -------- | ------------------------------------------------------------- |
| 🔵       | Extraire client/modules dans un context.ts (TASK-14) — délayé |
| 🟠       | Enum >25 options : warn + doc (TASK-27)                       |
| 🟣       | `pnpm dev` : hot-reload vs doc (TASK-30)                      |
| 🟢       | Docs : ajouter un logo + rétablir le hero image (TASK-31)     |
| 🟢       | CI docs : cache du store pnpm (TASK-32) — délayé              |
| 🟢       | Docs : home racine FR-only (TASK-33) — optionnel              |
| 🟢       | CI : `permissions` au niveau workflow (TASK-34)               |
| 🟢       | CI : factoriser le setup dupliqué (TASK-35) — incertain       |
| 🟢       | CI : uniformiser/scoper l'install (TASK-36) — incertain       |
