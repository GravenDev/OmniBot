🔍 Audit OmniBot

🔴 Sécurité

1. ~~Boutons sans vérification de permission~~ ✅ _fixed in c890904_

2. ~~Non-null assertion sans fallback sûr~~ ✅ _fixed in c890904_

3. client.token! et client.user!.id dans command-loader.ts — utilisés après ClientReady donc sûrs en pratique, mais une assertion explicite ou un guard serait plus
   robuste.

---

🟠 Dépendances — réductions possibles

4. ~~winston-daily-rotate-file — mort~~ ✅ _already removed_

5. ~~prisma CLI dans dependencies → doit aller en devDependencies~~ ✅ _fixed in 178beab_

6. ~~dotenv — dépendance cachée~~ ✅ _removed in 1570454_

7. ~~winston — remplacé par pino~~ ✅ _fixed in 6271f8f_

8. ~~@prisma/client épinglé exactement vs prisma en ^6.14.0~~ ✅ _both on ^6.19.3_

---

🟡 Qualité de code

9. ~~// @ts-ignore dans service.ts~~ ✅ _fixed in 799b469 — remplacé par Object.assign_

10. ~~for (let ...) au lieu de for (const ...)~~ ✅ _fixed in bb5dffa_

11. ~~Double bloc JSDoc dans registry.ts~~ ✅ _fixed in c07d0d7_

12. ~~Méthodes dépréciées non supprimées~~ ✅ _fixed in 81f4eab_

13. EventListener<any> et InteractionHandler<any> dans Registry — any dans les tableaux internes. Bound unknown ou union plus précis seraient préférables.

---

🟠 Correctness (nouveau)

18. Incohérence d'état dans les boutons enable/disable-module — listener-loader.ts

Dans enable-module.button.ts et disable-module.button.ts, si `installModule`/`uninstallModule` lève une exception, le followUp d'erreur est bien envoyé MAIS `defer.edit()` est quand même appelé immédiatement après, rafraîchissant l'UI comme si l'opération avait réussi.

```
try {
  await installModule(module, interaction.guild!);  // échoue
} catch {
  await interaction.followUp({ content: "Failed..." });  // erreur envoyée
}
// defer.edit() s'exécute quand même ici → UI rafraîchie = succès affiché
```

→ Ajouter un `return` dans le bloc catch après le followUp.

19. Rejets de promesses silencieux dans listener-loader.ts

Deux patterns sans `.catch()` :

- `listener.execute(...args).then()` — si un listener throw, l'erreur est avalée silencieusement
- La chaîne `moduleService.getModuleStateFromGuildIdIn().then(...)` n'a pas non plus de `.catch()`

En Node.js, les unhandledRejection peuvent crasher le process (selon la version) ou passer silencieusement.

20. `$` dans les remplacements regex — thread-creator.service.ts

Dans `generateThreadName`, les valeurs sont injectées comme chaînes de remplacement via `String.replace()`. Si le contenu d'un message utilisateur contient `$&`, `$1`, etc., JavaScript les interprète comme des backreferences dans le remplacement.

```typescript
threadName = threadName.replace(new RegExp(`\\{${key}\\}`, "g"), value);
// value = "$&" → insère le pattern matché au lieu de la valeur
```

→ Fix : `value.replace(/\$/g, "$$$$")` avant injection.

---

🟡 Qualité de code (nouveau)

21. Logique dupliquée dans interaction-create.listener.ts

Le pattern `flatMap(module => module.registry.commands.map(...)).find(...)` est répété trois fois dans le même fichier (handleCommand, handleComplete, handleInteraction). À extraire en helper privé.

22. Vérification de permission dupliquée entre enable/disable buttons

Les blocs de vérification `memberPermissions?.has(PermissionFlagsBits.Administrator)` sont copiés-collés à l'identique dans enable-module.button.ts et disable-module.button.ts. À extraire en utilitaire partagé.

---

🔵 Architecture

14. Dépendances circulaires — module-installer.ts et module.service.ts importent tous deux { client, modules } depuis ../../index.js.

→ Solution : context.ts. 🕐 _délayé — la circularité ESM fonctionne en pratique, à traiter lors d'une refonte plus large_

15. Extraction de guildId dans listener-loader.ts — fragile

```
args.find((arg) => !!arg.roles)?.id ||
args.find((arg) => !!arg?.guild).guild?.id ||
args.find((arg) => !!arg?.guildId)
```

Heuristique sur la shape des args Discord.js. Si la structure d'un event change, la détection silencieuse échoue. Mieux vaut que les EventListener de modules déclarent explicitement s'ils sont guild-scoped.

16. ~~Pas de graceful shutdown~~ ✅ _fixed in 48f44c9_

17. Script de consolidation Prisma potentiellement redondant — Prisma 6 supporte nativement les schémas multi-fichiers via glob. À investiguer lors d'une prochaine mise à jour Prisma.

---

🟢 Points positifs

- Toolchain moderne : oxlint + oxfmt (Rust-based) → rapide et peu verbeux
- TypeScript strict : noUncheckedIndexedAccess, exactOptionalPropertyTypes, verbatimModuleSyntax — configuration exemplaire
- Renovate configuré avec automerge, minimumReleaseAge, platformAutomerge, digest pinning GitHub Actions
- mise.toml pour épingler Node.js et pnpm — reproductibilité garantie
- Validation des vars d'env au démarrage propre et failfast
- Architecture modulaire bien pensée (Registry, Module, Declared) — extensible
- husky + commitlint — convention de commits enforced
- pino : logging léger et performant

---

Récapitulatif des actions restantes

┌──────────┬────────────────────────────────────────────────────────────────┐
│ Priorité │ Action │
├──────────┼────────────────────────────────────────────────────────────────┤
│ 🟠 │ Ajouter return dans catch des boutons enable/disable (#18) │
├──────────┼────────────────────────────────────────────────────────────────┤
│ 🟠 │ Ajouter .catch() sur les promesses dans listener-loader (#19) │
├──────────┼────────────────────────────────────────────────────────────────┤
│ 🟠 │ Fix regex $ dans generateThreadName (#20) │
├──────────┼────────────────────────────────────────────────────────────────┤
│ 🟡 │ Dédupliquer module lookup dans interaction-create (#21) │
├──────────┼────────────────────────────────────────────────────────────────┤
│ 🟡 │ Dédupliquer permission check dans les boutons (#22) │
├──────────┼────────────────────────────────────────────────────────────────┤
│ 🔵 │ Extraire client/modules dans un context.ts (#14) │
└──────────┴────────────────────────────────────────────────────────────────┘
