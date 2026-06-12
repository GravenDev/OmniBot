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

Les listes (`ListOf<T>`) sont prévues par le typage (`ResolveType`) ; l'édition de
listes via l'UI est hors périmètre de cette itération.

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
  const channel = config.get("logChannel"); // Channel | null
  const max = config.get("maxWarnings");     // number
}
```

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
- Réservée aux administrateurs (`PermissionFlagsBits`).
- Affiche un conteneur Components V2 listant chaque option : nom, description,
  type, valeur courante, et un accessoire d'édition selon le type :
  - bouton **toggle** pour les booléens (`toggle-option`) ;
  - bouton **éditer** pour tous les autres types (`configure-module`).

### Flux d'édition

1. `configure-module:<moduleId>:<clé>` →
   `ConfigTypeHandler.replyToEditRequest` ouvre l'éditeur adapté :
   - `STRING`/`NUMBER` : **modal** texte ;
   - `USER`/`ROLE`/`CHANNEL`/`CATEGORY` : **select menu** natif (ephemeral, V2).
2. La soumission (modal submit ou select) est routée vers le handler du type, qui
   **valide**, **persiste** via `ConfigService.updateConfigForModuleIn`, puis
   **réaffiche** la configuration à jour.

## Validation

`ConfigValidator` (dans `src/lib/config.ts`) fournit un prédicat par type, exposé
via `ConfigTypeHandler.validate(value)` :

- `NUMBER` : chaîne convertible en nombre fini ;
- `BOOLEAN` : `"true"` / `"false"` ;
- `USER`/`ROLE`/`CHANNEL`/`CATEGORY` : mention **ou** identifiant brut (snowflake) —
  les select menus renvoyant des ids bruts ;
- `STRING` : toujours valide.

## Travail restant (cette itération)

- [x] Implémenter la soumission du modal `NUMBER` (parsing + validation + sauvegarde).
- [x] Implémenter les handlers `USER`, `ROLE`, `CHANNEL`, `CATEGORY` (select menus).
- [x] Accepter les ids bruts dans les validateurs d'entités.
- [x] Supprimer le code mort `editionSection` / `editedField`.
- [x] Tests unitaires sur la lib (`ConfigValidator`, `getConfigTypeName`, `ConfigProvider`).

## Hors périmètre / suites possibles

- Édition d'options de type **liste** via l'UI.
- Notification des modules sur changement de configuration (hook `onConfigChange`).
- Migration du module Thread Creator (table `ThreadCreatorConfig` dédiée) vers ce
  système générique, une fois la lib stabilisée.
