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
