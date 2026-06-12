# Revue de code — complétion du système de configuration

Findings de la revue du commit `feat(config): complete editing for number and
entity field types` (+ module `test-config`). À traiter ultérieurement.

Légende statut : [ ] à faire · [x] fait

---

## Bugs (à corriger)

### [x] #1 — `config.get` ment sur la nullabilité des valeurs non définies

- **Fichier :** `src/lib/config.ts` (`ConfigData` / `ConfigProvider.get`),
  `src/core/services/config.service.ts` (`createDefaultConfigForModule`)
- **Problème :** un champ sans `defaultValue` n'a pas de valeur, mais `config.get`
  le type comme toujours présent (`ResolveType<T>`). Pour les entités
  (`USER`/`ROLE`/`CHANNEL`/`CATEGORY`) la valeur réelle est absente ; pour
  `STRING`/`NUMBER`/`BOOLEAN` le service fabrique de faux défauts (`""`/`0`/`false`)
  qui masquent l'état « non défini ».
- **Scénario d'échec :** un module fait `config.get("user").username` → compile
  sans erreur → `TypeError` au runtime quand le champ n'a jamais été configuré.
- **Sémantique cible :**
  - `undefined` = jamais défini ;
  - `null` = vidé intentionnellement (action « clear » future) ;
  - un champ **avec** `defaultValue` est toujours présent → **pas** de `| undefined`.
- **Fix proposé :**
  - Typage conditionnel sur la présence de `defaultValue` :
    ```ts
    type ConfigEntryValue<E extends ConfigEntry<ConfigType>> = E extends {
      defaultValue: unknown;
    }
      ? ResolveType<E["type"]>
      : ResolveType<E["type"]> | undefined;
    ```
    utilisé par `ConfigData` et `ConfigProvider.get`.
  - Runtime : `createDefaultConfigForModule` ne pose une valeur que si
    `defaultValue` est déclaré (sinon clé absente → `undefined`), au lieu de
    fabriquer `""`/`0`/`false`/`null`.
  - Garder `(config.get(key) ?? "").toString()` dans les `replyToEditRequest`
    des handlers string/number (la valeur peut désormais être `undefined`).

### [ ] #2 — Un champ de type liste affiche un bouton « éditer » mort

- **Fichiers :** `src/core/utils/core.messages.ts` (~l.77),
  `src/core/interactions/configure-module.button.ts` (l.29)
- **Problème :** `configurationMessage` pose un bouton `configure-module` pour
  tout type `!= BOOLEAN`, donc aussi pour un type tableau (`ListOf<T>`). Au clic,
  `configure-module.button` fait `if (Array.isArray(schemaDef.type)) return;`
  → no-op silencieux.
- **Scénario d'échec :** l'admin clique « éditer » sur un champ liste, rien ne se
  passe, aucun retour.
- **Fix proposé :** soit ne pas afficher de bouton d'édition pour les types liste
  dans `configurationMessage`, soit répondre « édition de liste non encore
  supportée » dans `configure-module.button`.

---

## Inefficacité (optionnel)

### [ ] #3 — Double désérialisation dans le toggle booléen

- **Fichier :** `src/core/interactions/toggle-option.button.ts` (l.22 puis l.36)
- **Problème :** `getConfigForModuleIn` puis `updateConfigForModuleIn`
  désérialisent chacun les entités (`deserializeConfigData` → fetch guild +
  entités Discord), alors qu'on ne change qu'un booléen.
- **Fix proposé :** lire la valeur booléenne courante via un chemin léger (cache
  sérialisé) sans désérialiser, et laisser `updateConfigForModuleIn` faire la
  seule passe nécessaire pour le rendu.
- **Note :** la racine (`deserializeConfigData` qui `fetch` la guild même sans
  champ entité) est pré-existante dans `config.service.ts`, hors périmètre strict
  du diff mais à garder en tête.

---

## Nettoyage (optionnel)

### [ ] #4 — Boilerplate des 4 handlers d'entité

- **Fichiers :** `src/core/config/{user,role,channel,category}-config-handler.ts`
- **Problème :** 4 sous-classes quasi identiques (~42 lignes chacune) ne variant
  que par builder de select, placeholder, filtre de type de salon et type guard.
- **Fix proposé :** rendre la base `EntitySelectConfigHandler` pilotée par une
  table de données `{ selectCustomId, buildMenu, channelTypes?, guard }` plutôt
  que par héritage — supprime ~150 lignes.

### [ ] #5 — Construction de modal dupliquée string/number

- **Fichiers :** `src/core/config/string-config-handler.ts`,
  `number-config-handler.ts`
- **Problème :** le modal (ModalBuilder → ActionRow → TextInput) et le flux de
  soumission sont quasi identiques ; seuls `customId`, label et validation
  diffèrent.
- **Fix proposé :** helper partagé `buildTextInputModal(...)` dans
  `config-edit.helpers.ts`.

---

## Améliorations UX (feature config)

### [ ] #6 — Éditer/remplacer le message de config existant après soumission de modale

- **Fichiers :** `src/core/config/string-config-handler.ts`,
  `number-config-handler.ts` (soumission de modale)
- **Problème :** après soumission d'une modale, on fait `interaction.reply(...)`
  → un **nouvel** embed de configuration est envoyé, en doublon du message
  `/config` d'origine. Perturbant. (Les select menus d'entité font déjà
  `interaction.update`, qui remplace en place — c'est le bon comportement.)
- **Fix proposé :** sur la soumission de modale, utiliser `interaction.update(...)`
  pour remplacer le message d'origine. La `ModalSubmitInteraction` issue d'un
  composant expose `.update()` quand `isFromMessage()` est vrai (notre cas : la
  modale est ouverte depuis un bouton du message de config). Uniformiser
  `saveConfigValue` côté rendu pour que tous les handlers éditent en place.

### [ ] #7 — Rendre la configuration visible de tous (non-ephemeral)

- **Fichiers :** `src/core/commands/config.command.ts`, tous les handlers/boutons
  qui répondent avec `MessageFlags.Ephemeral`
- **Problème :** modifier des paramètres qui impactent tout le serveur ne devrait
  pas être caché. Actuellement `/config` et les éditions sont ephemeral.
- **Fix proposé :** retirer `MessageFlags.Ephemeral` du message de config et de
  ses mises à jour, pour que la modification soit visible de tous. À combiner
  avec #6 (édition en place) pour un flux cohérent. Attention : revérifier le
  flux des select menus d'entité (le message du select devra aussi être public
  et cohérent en flags V2).

---

> Tâches transverses au projet (commandes guild en dev, ergonomie des imports)
> déplacées dans `audit.md`.
