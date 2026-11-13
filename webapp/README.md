# Plezy Web

Serveur et interface utilisés par le navigateur et les lanceurs TV. La version PC/mobile est servie sur `/` ; l’interface de télécommande sur `/tv/`.

## Démarrage

Node.js 24 recommandé, FFmpeg et FFprobe :

```sh
node server.js
```

Ouvrir http://localhost:8090. Sous Windows, `start.bat` utilise le même serveur. Les journaux locaux ne sont pas suivis dans Git.

Le déploiement Docker publie le port 8081 et inclut FFmpeg : voir [DEPLOY-DOCKER.md](DEPLOY-DOCKER.md).

## Configuration

Jellyfin et Seerr se configurent depuis l’interface. Les addons Stremio sont lus uniquement par le serveur depuis le fichier indiqué par `STREMIO_CONFIG_FILE` ; voir [la configuration privée](../docs/STREMIO.md).

Le serveur fournit `/proxy` pour les API et flux des services connectés. Les médias Stremio passent par des tickets temporaires opaques. Une installation exposée sur Internet doit être protégée par un reverse proxy HTTPS et le contrôle d’accès adapté au déploiement.

## Mode kiosque Stremio TV

Pour activer l'ouverture automatique de l'interface TV, configurer côté serveur la variable d'environnement `STREMIO_AUTH_KEY` avec une clé de session Stremio valide. Ne pas placer cette clé dans le dépôt, une URL ou le JavaScript servi au navigateur. Dans Docker Compose, transmettre explicitement cette variable au conteneur depuis une configuration privée. Alternativement, renseigner le champ `authKey` dans le fichier privé indiqué par `STREMIO_CONFIG_FILE`, puis redémarrer le conteneur.

Au démarrage, le serveur lit la collection de l'utilisateur via l'API Stremio. Les addons HTTPS compatibles sont ajoutés à ceux du fichier privé existant ; la collection est réactualisée à la prochaine ouverture après 30 minutes. En cas d'échec, l'écran de connexion reste accessible et un message est affiché. La clé et les URL d'addons ne sont jamais renvoyées par l'API de statut.

Le kiosque contourne l'écran de connexion Plezy : protéger l'accès au serveur par un VPN ou un reverse proxy authentifié avant de l'exposer sur Internet. Le profil Stremio utilisé dans Plezy est local et ne synchronise pas la bibliothèque ni la progression du compte Stremio.

Si l'hôte Android fournit `window.AndroidBridge.playVideo(url, title, subtitleUrl)`, la TV lui transmet une URL HTTP(S) absolue et, si disponible, un sous-titre français. Sans pont disponible ou si l'appel échoue, elle utilise le lecteur web. L'application hôte doit implémenter le pont ; l'interface ne l'installe pas et le contrat actuel ne transmet pas la position de reprise.

## Lecture

Le lecteur négocie les formats Jellyfin et propose les qualités HLS du backend Stremio. Le mode automatique tient compte du transfert des segments en excluant le temps de préparation côté serveur. Les qualités manuelles sont mémorisées sur l’appareil ; le mode Économie de données reste disponible.

Les segments sont préparés par groupes de trois avec des positions exactes. Les segments déjà produits et le tampon arrière limitent le coût des retours en arrière. Les erreurs réseau temporaires sont réessayées sans changer inutilement de source.

Audio, sous-titres, épisodes, chapitres, vitesse de lecture et format d’image sont accessibles depuis les réglages du lecteur, selon le média et les capacités du serveur.

Raccourcis : Espace = lecture/pause, flèches = ±10 secondes, F = plein écran, M = couper le son, Échap = retour.

## Catalogue, profils et installation

La bibliothèque et les fiches reprennent les informations des services connectés. Les profils personnalisés commencent sur une liste vide. Les sessions, préférences, listes locales et téléchargements sont propres au profil du navigateur et à l’origine du site.

Le catalogue est actualisé périodiquement ; les changements d’affichage sont différés pendant la lecture ou un dialogue. Seerr peut être associé par clé API, session ou QR code, avec validation côté serveur.

L’installation PWA et la lecture hors connexion exigent HTTPS ou localhost, un service worker actif et le support du stockage OPFS. Le cache de l’interface est rempli à la demande et exclut les sessions, API et flux privés.

Le mode démo utilise des illustrations publiques et un extrait de Tears of Steel de la Blender Foundation. Ces ressources sont utilisées par l’application et restent dans `public/art/`.

## Vérifications

```sh
npm test
```

Les tests FFmpeg créent leurs propres petits fichiers vidéo temporaires et les suppriment. Aucun compte ou accès Real-Debrid réel n’est nécessaire. Les tests de navigation TV partagent l’adaptateur source de `../smart-tv/`.

HLS.js et QR code sont distribués avec leurs licences dans `public/vendor/`.
