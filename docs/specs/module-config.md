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

| Type       | Saisie                  | Stockage (JSON) | Lecture (désérialisé) |
| ---------- | ----------------------- | --------------- | --------------------- |
| `STRING`   | Modal (texte)           | `string`        | `string`              |
| `NUMBER`   | Modal (texte → nombre)  | `number`        | `number`              |
| `BOOLEAN`  | Bouton toggle           | `boolean`       | `boolean`             |
| `USER`     | Select menu utilisateur | `string` (id)   | `User`                |
| `ROLE`     | Select menu rôle        | `string` (id)   | `Role`                |
| `CHANNEL`  | Select menu salon       | `string` (id)   | `Channel`             |
| `CATEGORY` | Select menu catégorie   | `string` (id)   | `CategoryChannel`     |

### Listes (`ListOf<T>`)

N'importe quel type peut être déclaré en **liste** via `type: [ConfigType.X]`. La
valeur lue est alors un tableau (`X[]`). L'édition dépend du type de base :

- **Entités** (`USER`/`ROLE`/`CHANNEL`/`CATEGORY`) → **multi-select** natif
  (jusqu'à 25 éléments, pré-sélection des valeurs courantes).
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

### Flux d'édition

Le bouton `configure-module:<moduleId>:<clé>` ouvre l'éditeur adapté au type
(`configure-module.button.ts` route selon scalaire/entité et selon liste) :

- `STRING`/`NUMBER` (scalaire) : **modal** texte ;
- `USER`/`ROLE`/`CHANNEL`/`CATEGORY` (scalaire ou liste) : **select menu** natif
  (mono ou multi selon liste), ephemeral, V2 ;
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
- `STRING` : toujours valide.

Pour les listes, chaque élément est validé individuellement (par valeur du
select pour les entités, à l'ajout dans l'éditeur pour les scalaires).

## Travail réalisé

- [x] Soumission du modal `NUMBER` (parsing + validation + sauvegarde).
- [x] Handlers `USER`/`ROLE`/`CHANNEL`/`CATEGORY` (select menus).
- [x] Ids bruts acceptés dans les validateurs d'entités.
- [x] Suppression du code mort `editionSection` / `editedField`.
- [x] Tests (lib + handlers : modal, select, éditeur de liste).
- [x] Édition des listes : multi-select pour les entités, éditeur
      ajouter/supprimer pour les scalaires.

## Hors périmètre / suites possibles

- Notification des modules sur changement de configuration (hook `onConfigChange`).

## Migrations réalisées

- **Thread Creator** (v2.0.0) : migré de sa table dédiée `ThreadCreatorConfig`
  vers ce système générique (clean cut, sans reprise de données). La commande
  `/thread-config` et le flag `enabled` ont été supprimés — la configuration se
  fait via `/config thread-creator` et l'activation via `/modules`. La table
  `thread_creator_configs` a été supprimée (migration `drop_thread_creator_config`).
