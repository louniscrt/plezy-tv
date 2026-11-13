# Plezy

Interface de streaming pour navigateur, Android TV / Xiaomi et Fire TV Vega.
Le site et les lanceurs TV utilisent le même serveur Plezy : les corrections du lecteur et du catalogue sont déployées dans `webapp/`.

Site utilisé : **https://plezy.louniscartron.fr**.

## Organisation

| Dossier | Rôle |
|---|---|
| [`webapp/`](webapp/) | Serveur Node.js, interface PC et mobile, interface `/tv/`, relais Jellyfin/Seerr et lecture Stremio |
| [`smart-tv/`](smart-tv/) | Lanceur Android TV / Xiaomi, module Home optionnel et lanceur Fire TV Vega |
| [`app/`](app/) | Application Android native historique, conservée pour les installations existantes |
| [`docs/STREMIO.md`](docs/STREMIO.md) | Configuration privée des addons |
| [`tools/`](tools/) | Configuration des addons et compilation de l’application Android native |

## Démarrer le serveur

Node.js **24 recommandé** et **FFmpeg / FFprobe** doivent être disponibles. Aucune dépendance npm n’est nécessaire pour le serveur.

```sh
cd webapp
node server.js
```

Ouvrir http://localhost:8090 pour le navigateur ou http://localhost:8090/tv/ pour la présentation TV.

Avec Docker, FFmpeg est inclus dans l’image :

```sh
cd webapp
docker compose up -d --build
```

Le serveur est alors publié sur le port **8081**. La procédure VPS et la configuration privée sont décrites dans [`webapp/DEPLOY-DOCKER.md`](webapp/DEPLOY-DOCKER.md).

## Lecture et qualité

- Le mode automatique distingue la préparation vidéo sur le serveur du temps de téléchargement et peut monter en 1080p.
- Les qualités manuelles 240p, 360p, 480p, 720p et 1080p, ainsi que le profil 4K selon la source et les capacités du serveur, sont accessibles dans **Réglages de lecture → Qualité vidéo**.
- Le mode **Économie de données** et les autres choix manuels sont mémorisés dans le navigateur.
- Les segments vidéo sont préparés par groupes et réutilisés pour limiter les coupures et les rechargements lors des retours arrière.
- La définition réelle dépend aussi du fichier source et des capacités de décodage / transcodage.

## Applications TV

Les lanceurs actuels se trouvent dans [`smart-tv/`](smart-tv/). Ils ouvrent l’interface TV du serveur configuré ; les sources et les tests de navigation sont conservés pour Android TV / Xiaomi et Vega.

L’ancienne application native reste disponible dans [`app/`](app/), avec son APK historique [`PlezyTV-FireOS-API22.apk`](PlezyTV-FireOS-API22.apk) et son script [`sideload-firetv.bat`](sideload-firetv.bat). Cet APK historique n’a pas été reconstruit avec les modifications du site.

## Vérification

```sh
npm test --prefix webapp
npm test --prefix smart-tv/vega
```

Les tests du serveur utilisent FFmpeg et FFprobe. Les tests des lanceurs utilisent Node.js ; le SDK Amazon et le SDK Android sont nécessaires uniquement pour compiler les applications correspondantes.

## Configuration privée

Les mots de passe, clés API, manifests Stremio privés, fichiers `.env`, clés de signature et configurations locales ne doivent pas être suivis dans Git. Le dépôt ne contient pas la configuration privée du VPS.

Le projet conserve la licence MIT annoncée dans ce dépôt. Les dépendances HLS.js et QR code conservent leurs licences dans `webapp/public/vendor/` et dans les ressources TV utilisées.
