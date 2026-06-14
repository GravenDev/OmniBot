# Spec — Système de configuration des modules

Issue : [#14](https://github.com/AsyncCommunityDiscord/OmniBot/issues/14)
Priorité : haute — assignée à RedsTom, jalon « Finish the module library ».

> Cette spec décrit l'architecture **réellement implémentée** (branche `feat/config`)
> et formalise le travail restant pour clore la fonctionnalité. Elle remplace la
> proposition normalisée initiale (`/config view|set|reset` + table `ModuleConfig`),
> abandonnée au profit d'une UI interactive et d'un stockage en blob JSON.

---

## Objectif

Permettre à chaque module de déclarer un schéma de configuration **typé**,
persistant en base par serveur, consultable et modifiable par les administrateurs
via une interface Discord interactive.

## Types de champs supportés

| Type       | Saisie                   | Stockage (JSON)  | Lecture (désérialisé) |
| ---------- | ------------------------ | ---------------- | --------------------- |
| `STRING`   | Modal (texte)            | `string`         | `string`              |
| `NUMBER`   | Modal (texte → nombre)   | `number`         | `number`              |
| `BOOLEAN`  | Bouton toggle            | `boolean`        | `boolean`             |
| `USER`     | Select menu utilisateur  | `string` (id)    | `User`                |
| `ROLE`     | Select menu rôle         | `string` (id)    | `Role`                |
| `CHANNEL`  | Select menu salon        | `string` (id)    | `Channel`             |
| `CATEGORY` | Select menu catégorie    | `string` (id)    | `CategoryChannel`     |
| `ENUM`     | Select menu (choix fixe) | `string` (choix) | union littérale¹      |

¹ `ENUM` représente un choix parmi un ensemble fixe déclaré sur l'entrée via
`options`. La valeur stockée et lue est l'une de ces options (un `string`). Si
`options` est déclaré `as const`, `config.get(...)` est typé comme l'**union
littérale** des valeurs (`"light" | "dark"`), sinon `string`. Voir
[Type `ENUM`](#type-enum-choix-fixe).

### Listes (`ListOf<T>`)

N'importe quel type peut être déclaré en **liste** via `type: [ConfigType.X]`. La
valeur lue est alors un tableau (`X[]`). L'édition dépend du type de base :

- **Entités** (`USER`/`ROLE`/`CHANNEL`/`CATEGORY`) → **multi-select** natif
  (jusqu'à 25 éléments, pré-sélection des valeurs courantes).
- **`ENUM`** (`[ConfigType.ENUM]`) → **multi-select** sur les `options` déclarées
  (min 0 pour autoriser le vidage, max = nombre d'options) ; pré-sélection des
  valeurs courantes.
- **Scalaires** (`STRING`/`NUMBER`) → **éditeur dédié** : un message listant
  chaque élément avec un bouton _Supprimer_, plus un bouton _Ajouter_ qui ouvre
  une modale validée par le type.
- **Booléens en liste** (`[BOOLEAN]`) → même éditeur, mais chaque élément est un
  **toggle** (bascule vrai/faux en place) ; _Ajouter_ insère directement un
  `false` (pas de modale).

## API pour les modules

Un module déclare son schéma dans `defineModule({ ..., config: { ... } })` :

```ts
config: {
  logChannel: {
    name: "Salon de logs",
    description: "Salon où poster les logs",
    type: ConfigType.CHANNEL,
  },
  maxWarnings: {
    name: "Avertissements max",
    description: "Nombre d'avertissements avant sanction",
    type: ConfigType.NUMBER,
    defaultValue: 3,
  },
}
```

Lecture des valeurs (désérialisées) côté composants du module :

```ts
async execute(interaction, config) {
  const channel = config.get("logChannel"); // Channel | undefined (pas de défaut)
  const max = config.get("maxWarnings");     // number (a un defaultValue)
}
```

Typage des valeurs : un champ **avec** `defaultValue` est toujours présent ; un
champ **sans** défaut peut être `undefined` (jamais défini). `null` est réservé à
une valeur effacée intentionnellement. Voir `ConfigEntryValue` dans
`src/lib/config.ts`.

### Type `ENUM` (choix fixe)

Un champ `ENUM` déclare un ensemble fixe de valeurs autorisées via `options` :

```ts
config: {
  logLevel: {
    name: "Niveau de log",
    description: "Verbosité des logs",
    type: ConfigType.ENUM,
    options: ["debug", "info", "warn", "error"] as const, // `as const` → union littérale
    defaultValue: "info",
  },
  // Liste : plusieurs choix parmi le même ensemble (multi-select)
  enabledFeatures: {
    name: "Fonctionnalités",
    description: "Modules optionnels activés",
    type: [ConfigType.ENUM],
    options: ["welcome", "logs", "automod"] as const,
  },
}
```

- `options` est **obligatoire** sur une entrée `ENUM` (le type l'exige).
- `as const` fait que `config.get("logLevel")` est typé `"debug" | "info" |
"warn" | "error"` (l'union littérale) ; sans `as const`, c'est `string`.
- La valeur est stockée telle quelle (un `string`) ; aucune désérialisation.

Le `ConfigProvider` est injecté automatiquement dans `execute`/`complete`/`check`
des commandes, listeners et interaction handlers (voir
`interaction-create.listener.ts`, `listener-loader.ts`).

## Persistance

Stockage en **un blob JSON par serveur** (et non une table normalisée) :

```prisma
model GuildConfiguration {
  guildId String @id
  data    Json
}
```

- `data` mappe `moduleId -> { clé: valeur sérialisée }`.
- Les entités Discord (user/role/channel/category) sont stockées par **id** et
  réhydratées à la lecture par `ConfigService.deserializeConfigData`.
- Un cache en mémoire (`configCache`) évite un aller-retour base à chaque lecture ;
  il est invalidé à chaque écriture.
- Les valeurs par défaut sont matérialisées à la création de la config du serveur.

## Interface admin

### Commande `/config <module>`

- Option `module` requise, avec autocomplétion (modules activés + core).
- Réservée aux administrateurs (`setDefaultMemberPermissions`).
- Réponse **publique** (Components V2) : une modification impactant tout le
  serveur ne doit pas être cachée. Comme le message est public, les
  interactions d'édition sont réservées aux admins via le flag déclaratif
  `requiresAdmin` (sur `InteractionHandler`), enforcé centralement par le
  dispatcher d'interactions.
- Liste chaque option : nom, description, type, valeur courante, et un accessoire
  d'édition selon le type :
  - bouton **toggle** pour les booléens (`toggle-option`) ;
  - bouton **éditer** pour tous les autres types (`configure-module`).
- **Pagination** : chaque champ coûte 3 composants (section + texte + bouton) et
  Discord plafonne un message à **40 composants**. Le panneau affiche donc
  `CONFIG_FIELDS_PER_PAGE` champs par page (10) avec une barre _◀ Précédent /
  Suivant ▶_ (`config-page:<moduleId>:<page>`) qui ré-affiche le panneau en place.
  La barre n'apparaît qu'au-delà d'une page. Après une édition, le panneau se
  ré-affiche sur la **page contenant le champ modifié** : cette page est
  **déduite** de la position de la clé dans le schéma (`configPageOfKey`), donc
  aucun `page` n'est threadé dans les `customId` (contrairement à
  `sourceMessageId`). Comme un admin ne peut cliquer que sur la page affichée, la
  page déduite est toujours celle qu'il regardait.
- **Limitation multi-admin** (assumée) : le panneau étant **un seul message
  public partagé**, sa page courante est un état **global**, pas par-utilisateur.
  Deux admins ne peuvent pas naviguer indépendamment, et l'action de l'un
  re-rend le message pour tous. C'est purement cosmétique (la persistance est
  toujours correcte) et rare ; le seul vrai correctif serait un panneau ephemeral
  par-utilisateur, écarté par choix (panneau public, voir #7).

### Flux d'édition

Le bouton `configure-module:<moduleId>:<clé>` ouvre l'éditeur adapté au type
(`configure-module.button.ts` route selon scalaire/entité et selon liste) :

- `STRING`/`NUMBER` (scalaire) : **modal** texte ;
- `USER`/`ROLE`/`CHANNEL`/`CATEGORY` (scalaire ou liste) : **select menu** natif
  (mono ou multi selon liste), ephemeral, V2 ;
- `ENUM` (scalaire ou liste) : **string select menu** rempli avec les `options`
  de l'entrée (mono ou multi selon liste), ephemeral, V2 (`enum.config-handler.ts`) ;
- listes scalaires (`STRING`/`NUMBER`/`BOOLEAN`) : **éditeur ajouter/supprimer**
  (`scalar-list-editor.ts`).

La soumission (modal submit, select, ou ajout/suppression) **valide**, **persiste**
via `ConfigService.updateConfigForModuleIn`, puis **réaffiche** le message public.

- Les éditions directes (modale `STRING`/`NUMBER`, toggle booléen) éditent le
  message de config **public en place** (`interaction.update`), sans nouvel embed.
- Les select menus d'entité et l'éditeur de listes scalaires sont des messages
  **ephemeral** séparés (visibles du seul admin). Après chaque modification ils
  rafraîchissent le message public d'origine via
  `refreshSourceConfigMessage` : l'id du message public est threadé dans les
  `customId` des composants de l'éditeur, et le service ré-édite ce message
  (`channel.messages.fetch(id).edit(...)`).
- **Invariant** : aucune vue config (`configurationMessage`) n'est jamais rendue
  sur un message ephemeral — sinon ses boutons « Éditer » pointeraient vers un
  message ephemeral non éditable par id. Le submit d'un select d'entité re-rend
  donc **le select** (avec la sélection à jour), pas une vue config.

### Affichage des valeurs

`renderCurrentValue` (dans `core.messages.ts`) rend les **entités** sous forme de
mentions **hors backticks** (Discord les affiche en `@rôle` / `#salon`) et les
**scalaires** entre backticks. Les listes sont jointes ; une valeur absente
s'affiche `—`.

## Validation

`ConfigValidator` (dans `src/lib/config.ts`) fournit un prédicat par type, exposé
via `ConfigTypeHandler.validate(value)` :

- `NUMBER` : chaîne convertible en nombre fini ;
- `BOOLEAN` : `"true"` / `"false"` ;
- `USER`/`ROLE`/`CHANNEL`/`CATEGORY` : mention **ou** identifiant brut (snowflake) —
  les select menus renvoyant des ids bruts ;
- `STRING` : toujours valide ;
- `ENUM` : le prédicat générique accepte tout (il n'a pas accès aux `options`) ;
  l'appartenance à `options` est vérifiée par `EnumConfigHandler`, qui rejette
  toute valeur soumise hors de l'ensemble déclaré.

Pour les listes, chaque élément est validé individuellement (par valeur du
select pour les entités et les enums, à l'ajout dans l'éditeur pour les scalaires).

## Travail réalisé

- [x] Soumission du modal `NUMBER` (parsing + validation + sauvegarde).
- [x] Handlers `USER`/`ROLE`/`CHANNEL`/`CATEGORY` (select menus).
- [x] Ids bruts acceptés dans les validateurs d'entités.
- [x] Suppression du code mort `editionSection` / `editedField`.
- [x] Tests (lib + handlers : modal, select, éditeur de liste).
- [x] Édition des listes : multi-select pour les entités, éditeur
      ajouter/supprimer pour les scalaires.
- [x] Type `ENUM` (choix fixe parmi `options`), scalaire et liste, édité via
      string select menu, avec typage en union littérale.
- [x] Pagination du panneau `/config` (10 champs/page) pour respecter le plafond
      de 40 composants de Discord.

## Hors périmètre / suites possibles

- Notification des modules sur changement de configuration (hook `onConfigChange`).

## Migrations réalisées

- **Thread Creator** (v2.0.0) : migré de sa table dédiée `ThreadCreatorConfig`
  vers ce système générique (clean cut, sans reprise de données). La commande
  `/thread-config` et le flag `enabled` ont été supprimés — la configuration se
  fait via `/config thread-creator` et l'activation via `/modules`. La table
  `thread_creator_configs` a été supprimée (migration `drop_thread_creator_config`).
