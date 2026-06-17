# Localisation

OmniBot permet de traduire les interfaces des modules par serveur grâce à un système d'i18n basé sur i18next. Chaque module peut fournir ses propres fichiers de traduction, avec un repli automatique vers le namespace principal.

## Fonctionnement

- La locale du serveur est configurée via `/config core > locale` (`en` ou `fr` actuellement).
- Chaque module peut inclure un dossier `i18n/` avec un fichier JSON par locale.
- Les clés sont résolues dans l'ordre : namespace du module → namespace principal.
- Quand un fichier de locale est manquant, l'anglais est utilisé comme valeur de repli.

## Structure d'un module

```
src/modules/mon-module/
├── mon-module.module.ts
├── i18n/
│   ├── en.json
│   └── fr.json
└── commands/
    └── ...
```

Les fichiers de traduction sont découverts automatiquement au démarrage par le chargeur de modules — aucun enregistrement n'est nécessaire.

## Format des fichiers de traduction

```json
{
  "module.name": "Mon Module",
  "module.description": "Fait des choses géniales.",
  "config.myField.name": "Mon champ",
  "config.myField.description": "Description de mon champ.",
  "greeting": "Bonjour {{name}} !"
}
```

Utilisez la syntaxe <code v-pre>{{param}}</code> pour les valeurs dynamiques — ne concaténez jamais avec `${}` ou `+` dans le texte traduit.

### Métadonnées du module

| Clé                  | Remplace                            |
| -------------------- | ----------------------------------- |
| `module.name`        | `name` dans `defineModule()`        |
| `module.description` | `description` dans `defineModule()` |

### Étiquettes des champs de configuration

| Motif de clé                    | Remplace                              |
| ------------------------------- | ------------------------------------- |
| `config.<fieldKey>.name`        | `name` du champ dans le schéma        |
| `config.<fieldKey>.description` | `description` du champ dans le schéma |

### Valeurs par défaut

La valeur par défaut d'un champ texte libre (`STRING`) peut être localisée, afin qu'une valeur non configurée s'affiche dans la langue du serveur :

| Motif de clé                | Remplace                                             |
| --------------------------- | ---------------------------------------------------- |
| `config.<fieldKey>.default` | Le `defaultValue` du champ (champs texte uniquement) |

Le `defaultValue` du schéma reste le repli anglais. Les défauts ne sont **pas persistés** : `ConfigProvider.get()` les résout à la lecture, donc la valeur suit la langue du serveur et change en direct si la langue change — jusqu'à ce qu'un admin définisse explicitement le champ, après quoi la valeur stockée prime et ne suit plus la langue.

Seuls les champs `STRING` sont localisés ainsi. Les défauts d'enum sont des identifiants stockés (pas du texte affichable) et sont renvoyés tels quels, comme les nombres, booléens et listes.

> [!NOTE]
> Les serveurs dont la config est antérieure à ce mécanisme conservent le défaut
> déjà stocké jusqu'à un reset via `/config` — il n'y a pas de migration
> automatique.

## Utiliser les traductions dans le code

Le `ConfigProvider` injecté dans les commandes, écouteurs et interactions expose une méthode `t()` :

```typescript
async execute(interaction, config) {
  const greeting = config.t("greeting", { name: interaction.user.username });
  await interaction.reply(greeting);
}
```

### Localisation des noms de types

La fonction utilitaire `getConfigTypeName()` accepte une `TFunction` optionnelle pour les noms de types localisés :

```typescript
import { getConfigTypeName } from "#lib/config.js";

const label = getConfigTypeName(ConfigType.STRING, config.t);
// → "Text" (EN) ou "Texte" (FR)
```

### Dans les commandes

```typescript
data: new SlashCommandBuilder()
  .setName("hello")
  .setDescription("Says hello!")
  .setDescriptionLocalizations({ fr: "Dit bonjour !" }),
```

Dans ce bot, seules les descriptions sont localisées — les noms de commandes restent en anglais.

## Repli vers le namespace principal

Les chaînes d'interface communes sont fournies par le namespace principal et disponibles dans tous les modules sans être redéfinies :

| Clé               | Valeur anglais                                                     | Valeur français                                                    |
| ----------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `config.previous` | ◀ Previous                                                         | ◀ Précédent                                                        |
| `config.next`     | Next ▶                                                             | Suivant ▶                                                          |
| `config.page`     | Page &#123;&#123;current&#125;&#125;/&#123;&#123;total&#125;&#125; | Page &#123;&#123;current&#125;&#125;/&#123;&#123;total&#125;&#125; |
| `modules.enable`  | Enable                                                             | Activer                                                            |
| `modules.disable` | Disable                                                            | Désactiver                                                         |
| `type.text`       | Text                                                               | Texte                                                              |
| `type.number`     | Number                                                             | Nombre                                                             |
| `type.boolean`    | Boolean                                                            | Booléen                                                            |
| `type.user`       | User                                                               | Utilisateur                                                        |
| `type.role`       | Role                                                               | Rôle                                                               |
| `type.channel`    | Channel                                                            | Salon                                                              |
| `type.category`   | Category                                                           | Catégorie                                                          |
| `type.choice`     | Choice                                                             | Choix                                                              |
| `type.listOf`     | List of &#123;&#123;type&#125;&#125;                               | Liste de &#123;&#123;type&#125;&#125;                              |

## Ajouter une nouvelle locale

1. Ajoutez le code de locale dans l'ENUM `locale` de `src/core/core.config.ts`.
2. Créez `i18n/<locale>.json` dans le module principal avec les traductions de toutes les clés principales.
3. Créez `i18n/<locale>.json` dans chaque module que vous souhaitez traduire.
4. Les admins du serveur peuvent ensuite sélectionner la nouvelle locale via `/config core > locale`.

## Bonnes pratiques

- **Écrivez les valeurs TypeScript en anglais** — elles servent de valeur de repli quand aucune traduction ne correspond.
- **Utilisez toujours des paramètres nommés** (<code v-pre>{{param}}</code>) dans les valeurs i18n, jamais les templates littéraux `${}`.
- **Ne traduisez que les chaînes spécifiques au module** — les étiquettes d'interface communes viennent du namespace principal.
- **Gardez les fichiers de traduction complets** — les clés manquantes tombent en anglais, ce qui peut produire un affichage multilingue.
