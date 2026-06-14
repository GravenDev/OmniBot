# Revue de code — enregistrement des commandes en mode dev (dev guild)

Findings de la revue du travail dev-guild (audit #23 + #25, encore non commité au
moment de la revue) : `loadDevGuildCommands`, branchement dev/prod dans
`index.ts`, `env.ts`, `validate-env-vars.mjs`, script `dev`, test d'intégration.

Le diff est globalement sain — aucun bug bloquant. Rangé du plus actionnable au
moins prioritaire.

Légende statut : [ ] à faire · [x] fait

---

## À corriger

### [x] #1 — `loadDevGuildCommands` ne fait pas `await` sur le `rest.put`

- **Fichier :** `src/core/loaders/command-loader.ts` (`loadDevGuildCommands`, et
  même pattern dans `loadGlobalCommands`)
- **Problème :** la fonction est `async` et est `await`ée par `index.ts`, mais elle
  chaîne `rest.put(...).then().catch()` sans `await`/`return`. Elle résout donc
  avant la fin du PUT ; l'erreur n'est captée que dans le `.catch` (pas propagée),
  et le « ready » est loggé avant l'enregistrement effectif. Incohérent avec
  `installModuleCommandsIn` qui fait `await`.
- **Scénario :** un PUT qui échoue (token invalide, rate limit, body > 100
  commandes) n'est que loggé ; le démarrage continue comme si tout allait bien.
- **Fait :** `await rest.put(...)` dans un `try/catch` sur `loadDevGuildCommands`
  **et** `loadGlobalCommands` (rendue `async`, désormais `await`ée dans
  `index.ts`).

### [x] #2 — Le test d'intégration n'assert pas la présence des commandes core

- **Fichier :** `src/core/loaders/command-loader.integration.test.ts`
- **Problème :** `putBodyNames()` ne vérifiait que les commandes de module ; aucun
  test n'assertait que les commandes du core sont incluses dans le body du PUT dev.
- **Scénario :** une régression retirant `coreModule.registry.commands` de
  l'agrégat passerait les tests au vert → fausse couverture.
- **Fait :** `core.module.js` mocké avec une commande core connue ; assertions
  ajoutées (présence de `core-cmd` dans le PUT, et un test « core seul, sans
  module » → body == `["core-cmd"]`).

---

## Optionnel

### [ ] #3 — Requêtes d'état des modules séquentielles

- **Fichier :** `src/core/loaders/command-loader.ts` (`loadDevGuildCommands`)
- **Problème :** `getModuleStateFromGuildIdIn` est `await`é par module dans la
  boucle → N requêtes DB en série au démarrage.
- **Fix :** paralléliser via `Promise.all` sur les états, puis filtrer. Impact
  faible aujourd'hui (peu de modules), réel à l'échelle.

### [ ] #4 — Duplication REST + logging entre `loadGlobalCommands` et `loadDevGuildCommands`

- **Fichier :** `src/core/loaders/command-loader.ts`
- **Problème :** construction du client REST + bloc `.then/.catch` de logging par
  commande dupliqués.
- **Fix :** extraire `registerCommands(rest, route, body, label)` pour éviter la
  divergence dev/prod. (Recouvre aussi la répétition de
  `registry.commands.map(c => c.data.toJSON())`, présente à 3-4 endroits.)

### [x] #5 — `index.ts` connaît les deux flux d'enregistrement (altitude)

- **Fichier :** `src/index.ts` (handler `ClientReady`)
- **Problème :** le caller encode en détail dev (agrégat) vs prod (version-gate +
  global). Toute évolution future doit choisir « dev / prod / les deux » et
  toucher `index.ts`.
- **Fait :** point d'entrée unique `syncCommands(client, modules)` dans
  `command-loader.ts` qui possède l'aiguillage dev/prod ; `index.ts` l'appelle en
  une ligne (6888918).

### [ ] #6 — Littéral `"development"` dupliqué

- **Fichiers :** `bootstrap/validate-env-vars.mjs` et `src/lib/env.ts`
  (`isDevMode`)
- **Problème :** la définition du mode dev (`NODE_ENV === "development"`) existe à
  deux endroits ; le `.mjs` bootstrap ne peut pas importer le `.ts` facilement.
- **Fix :** extraire une petite constante partagée importable des deux côtés.
