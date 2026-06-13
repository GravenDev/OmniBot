🔍 Audit OmniBot

> Les items portent un ID stable `**#N**` (référencé par les commits, ex.
> « fixed in #26 »). Ils sont en **puces** à dessein : oxfmt renumérote les listes
> ordonnées markdown, ce qui corromprait ces identifiants.

🔴 Sécurité

- **#1** — ~~Boutons sans vérification de permission~~ ✅ _fixed in c890904_
- **#2** — ~~Non-null assertion sans fallback sûr~~ ✅ _fixed in c890904_
- **#3** — client.token! et client.user!.id dans command-loader.ts — utilisés après ClientReady donc sûrs en pratique, mais une assertion explicite ou un guard serait plus robuste.

---

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
- **#15** — Extraction de guildId dans listener-loader.ts — fragile :

  ```
  args.find((arg) => !!arg.roles)?.id ||
  args.find((arg) => !!arg?.guild).guild?.id ||
  args.find((arg) => !!arg?.guildId)
  ```

  Heuristique sur la shape des args Discord.js. Si la structure d'un event change, la détection silencieuse échoue. Mieux vaut que les EventListener de modules déclarent explicitement s'ils sont guild-scoped.

- **#16** — ~~Pas de graceful shutdown~~ ✅ _fixed in 48f44c9_
- **#17** — Script de consolidation Prisma potentiellement redondant — Prisma 6 supporte nativement les schémas multi-fichiers via glob. À investiguer lors d'une prochaine mise à jour Prisma.

---

🟣 Confort de développement (DX)

- **#23** — ~~Commandes du core enregistrées en global (~1 h de propagation, pénible en dev)~~ ✅ _fait : en `isDevMode()`, enregistrement sur `DEV_GUILD_ID` (instantané) ; global conservé en prod_
- **#24** — Imports verbeux/fragiles : suffixe `.js` obligatoire (résolution `NodeNext`/ESM) et remontée `../../..`.
  - Alias sans outil : privilégier les **subpath imports** natifs de Node (`"imports": { "#lib/*": "./dist/lib/*.js" }` dans `package.json`) → aucun build supplémentaire. Alternative : `paths` tsconfig + `tsc-alias`.
  - Suppression du `.js` : nécessite un bundler (esbuild/tsup) ou `moduleResolution: "Bundler"` + loader — impacte le pipeline, à arbitrer séparément.
  - Valider `tsx` (dev), `tsc` (build) et `vitest` (tests) avec la solution retenue.
- **#25** — ~~Gate de version inadapté en dev pour les commandes de module~~ ✅ _fait : en `isDevMode()`, `loadDevGuildCommands` enregistre core + commandes des modules activés en un seul PUT sur la dev guild à chaque boot (sans bump de version) ; gate par version conservé en prod_
- **#26** — Permission des interactions — défaut _fail-open_ (dette de conception, faible). Le flag `requiresAdmin?: boolean` sur `InteractionHandler` (enforcé par le dispatcher) est **optionnel** : un handler sans flag est public. Sûr aujourd'hui (tous les handlers sont admin et explicitement marqués), mais repose sur l'humain pour ne pas oublier `requiresAdmin: true` sur un futur handler sensible.
  - **Évolution possible (option C, safe-by-construction)** : remplacer le flag optionnel par un champ **requis** type `access: "admin" | "everyone"` (aucun défaut) → le typage force chaque handler à déclarer son niveau d'accès, impossible d'oublier.
  - **Déclencheur** : à faire quand le nombre de handlers grandit, ou dès l'apparition du premier handler volontairement non-admin (le risque d'oubli devient alors réel).

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
| 🟣       | Ergonomie des imports : alias + .js (#24)                 |
| 🟣       | Accès interactions : champ requis (option C, #26) — évol. |
| 🟠       | Enum >25 options : warn + doc (#27)                       |
