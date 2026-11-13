# Lanceurs Plezy TV

Ces applications affichent l’interface TV du serveur Plezy configuré. Les fichiers du site et du lecteur restent dans [`../webapp/`](../webapp/) : une mise à jour du serveur fournit ces changements aux lanceurs.

| Dossier | Utilisation |
|---|---|
| `app/` | Lanceur Android TV / Xiaomi et Fire OS utilisant une WebView, paquet `fr.plezy.smarttv` |
| `home/` | Module Home optionnel Android, paquet `fr.plezy.home` |
| `vega/` | Lanceur Fire TV Vega, paquet `fr.plezy.smarttv.vega` |

Au lancement, configurer l’adresse du serveur, par exemple `https://plezy.louniscartron.fr`. L’adresse et la session restent mémorisées sur l’appareil. Les touches de télécommande et de lecture sont adaptées par `app/src/main/assets/tv.js`.

## Android TV / Xiaomi

Préparer Java 17, Gradle 8.4 et le SDK Android 34. Depuis `smart-tv/` :

```sh
gradle --no-daemon assembleDebug lintDebug
```

Pour synchroniser aussi les modules JavaScript partagés avant compilation sous Windows, utiliser `build.ps1` avec l’outillage indiqué dans ce script. Le paquet principal est produit dans `app/build/outputs/apk/debug/` et le module Home dans `home/build/outputs/apk/debug/`. Les sorties générées sont ignorées par Git.

Le module Home est facultatif : son installation et l’autorisation d’accessibilité sont un choix distinct de l’installation de Plezy TV.

## Fire TV Vega

Voir [`vega/README.md`](vega/README.md) pour le SDK Amazon et la compilation du paquet Vega.

## Tests de navigation

```sh
npm test --prefix vega
```

La préparation génère l’injection à partir des sources partagées. Les tests du lanceur, des URL, des erreurs document/média et de la navigation distante utilisent Node.js sans installer les dépendances Amazon.

L’application Android native historique, indépendante de ces lanceurs, reste dans [`../app/`](../app/).
