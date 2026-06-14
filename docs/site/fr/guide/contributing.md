# Contribuer

Les contributions sont les bienvenues de tous — membres de la communauté Graven - Développement et staff. Ce projet est développé pour et par la communauté Discord [Graven - Développement](https://discord.gg/graven).

## Pour commencer

1. Forkez le dépôt sur GitHub
2. Clonez votre fork
3. Configurez l'environnement de développement (voir [Pour commencer](./getting-started))
4. Créez une branche pour votre travail

```bash
git checkout -b feat/ma-fonctionnalite
```

## Conventional Commits

Les messages de commit doivent suivre le format [Conventional Commits](https://www.conventionalcommits.org/). Ceci est imposé par **commitlint** via un hook lefthook pre-commit.

```
type(scope): description

feat(thread-creator): ajouter file d'attente de création
fix(config): gérer les valeurs undefined dans le handler number
docs(commands): expliquer le flux d'autocomplétion
chore(deps): mettre à jour pnpm vers v11
```

### Types autorisés

| Type       | Utilisation                                               |
| ---------- | --------------------------------------------------------- |
| `feat`     | Une nouvelle fonctionnalité                               |
| `fix`      | Une correction de bug                                     |
| `chore`    | Maintenance, dépendances, outillage                       |
| `docs`     | Changements de documentation                              |
| `refactor` | Restructuration du code sans changement de fonctionnalité |
| `test`     | Ajout ou mise à jour de tests                             |
| `ci`       | Changements de configuration CI/CD                        |

## Avant d'ouvrir une PR

Exécutez ces vérifications localement — les mêmes vérifications sont effectuées dans la CI :

```bash
pnpm build                  # Doit réussir
pnpm test                   # Tous les tests doivent passer (unitaire + intégration)
pnpm exec oxlint --deny-warnings  # Aucun avertissement de lint
pnpm exec oxfmt --check     # Le formatage du code doit être correct
```

Pour corriger automatiquement le formatage et les problèmes de lint :

```bash
pnpm format                 # oxfmt --write + oxlint --fix --fix-suggestions
```

## Workflow de PR

1. **Branchez depuis `master`** — gardez votre branche à jour
2. **Faites des commits ciblés** — chaque commit doit représenter un changement logique
3. **Gardez les PR petites** — plus facile à reviewer, plus rapide à merger
4. **Ouvrez une PR tôt en draft** — obtenez des retours pendant que vous travaillez
5. **Assurez-vous que la CI est verte** — corrigez les échecs
6. **Demandez une review** — au moins une approbation requise

### Convention de titre de PR

Suivez le même format Conventional Commits pour les titres de PR :

```
feat(module): ajouter la fonctionnalité de journalisation des messages
fix(core): résoudre la condition de course dans la vérification des permissions
```

## Style de code

### Formatage

- **oxfmt** gère tout le formatage (remplace Prettier)
- Exécutez `pnpm format` avant de commiter
- Le hook `pre-commit` lefthook exécute oxfmt + oxlint sur les fichiers stagés

### Linting

- **oxlint** applique les règles de qualité de code
- Exécutez `pnpm exec oxlint --deny-warnings` pour vérifier
- Certains avertissements peuvent être corrigés automatiquement avec `pnpm format`

### Imports

- Entre répertoires : utilisez les subpath imports `#` (`#lib/config.js`, `#core/...`)
- Même répertoire : utilisez les imports relatifs (`./fichier.js`)
- Incluez toujours l'extension `.js` (NodeNext)

### Nommage

- Les fichiers utilisent des suffixes de rôle : `*.command.ts`, `*.listener.ts`, `*.button.ts`, `*.service.ts`
- Les IDs de module sont en kebab-case : `thread-creator`, `mon-module`
- Les types et interfaces sont en PascalCase

## Tests

Nous utilisons **Vitest** pour les tests. Les tests sont co-localisés avec les fichiers source :

```
src/lib/config.ts            # Source
src/lib/config.test.ts       # Tests
src/core/services/module.service.ts
src/core/services/module.service.test.ts
```

### Exécuter les tests

```bash
pnpm test                    # Tous les tests
pnpm test:unit               # Tests unitaires uniquement
pnpm test:integration        # Tests d'intégration uniquement
pnpm test -- --watch         # Mode watch
```

### Écrire des tests

- **Tests unitaires** : testent la logique isolée (parseurs, utilitaires, algorithmes)
- **Tests d'intégration** : testent les interactions avec l'API Discord (mockée) et la base de données
- Les tests utilisent `vi.mock()` pour isoler les dépendances
- Consultez les tests existants pour les modèles et conventions

## Trouver des tâches

- **[AUDIT.md](../../../AUDIT.md)** — suit la dette technique, les problèmes connus et les suivis
- **[GitHub Issues](https://github.com/GravenDev/OmniBot/issues)** — demandes de fonctionnalités et rapports de bugs
- **[Documents de review](../../../docs/review/)** — résultats de revue de code avec éléments actionnables

## Besoin d'aide ?

- Rejoignez le serveur Discord [Graven - Développement](https://discord.gg/graven)
- Ouvrez une [Discussion GitHub](https://github.com/GravenDev/OmniBot/discussions)
- Consultez la [documentation](/) pour les guides et références
