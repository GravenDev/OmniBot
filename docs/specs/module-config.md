# Spec — Système de configuration des modules

Issue : [#14](https://github.com/AsyncCommunityDiscord/OmniBot/issues/14)  
Priorité : haute — en cours de développement (RedsTom)

---

## Objectif

Permettre à chaque module de déclarer un schéma de configuration typé, persistent en base, consultable et modifiable par les admins de serveur via des commandes Discord.

## Types de champs supportés

- Texte libre
- Nombre entier / décimal
- Booléen
- Utilisateur Discord
- Rôle Discord
- Salon Discord
- Catégorie Discord

## API pour les modules

Un module doit pouvoir :

1. Déclarer son schéma de configuration (champs, types, valeurs par défaut, descriptions)
2. Lire les valeurs configurées pour un serveur donné
3. Être notifié d'un changement de configuration (optionnel)

## Commandes exposées aux admins

### `/config view [module]`

Affiche la configuration actuelle d'un module pour le serveur. Si `module` est omis, liste tous les modules configurables.

### `/config set <module> <clé> <valeur>`

Modifie une valeur de configuration. La valeur est validée selon le type déclaré par le module.

### `/config reset <module> [clé]`

Réinitialise une clé (ou toute la configuration du module) aux valeurs par défaut.

## Schéma de données (proposition)

```prisma
model ModuleConfig {
  guildId    String
  moduleId   String
  key        String
  value      String  @db.Text

  @@id([guildId, moduleId, key])
}
```

Les valeurs sont stockées sérialisées en texte ; la désérialisation est assurée par la lib selon le type déclaré.

## Impact sur les modules existants

Le module Thread Creator utilise actuellement sa propre table `ThreadCreatorConfig`. Une migration vers ce système générique est à envisager une fois la lib stable.
