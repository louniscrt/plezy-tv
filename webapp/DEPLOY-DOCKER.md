# Déployer Plezy avec Docker

L’image exécute le serveur Node.js et sert l’interface web ainsi que les API sur le même port. FFmpeg et FFprobe sont inclus. Un hébergement statique du seul dossier `public/` ne fournit pas le relais nécessaire à la lecture.

## Installation

Depuis un clone du dépôt :

```sh
cd webapp
docker compose up -d --build
curl --fail http://localhost:8081/health
```

La vérification doit retourner `{"service":"plezy-web","status":"ok","relay":true}`.

Le navigateur utilise `/` et les lanceurs TV utilisent `/tv/`. Pour publier le service sous un domaine HTTPS, diriger le reverse proxy vers le port 8081 et conserver les chemins `/api/`, `/proxy` et les en-têtes de streaming, dont `Range` et `Server-Timing`.

## Addons privés

Créer la configuration hors du dépôt avec l’outil interactif :

```sh
python3 ../tools/configure-stremio.py
export PLEZY_STREMIO_CONFIG="$HOME/.config/plezy/stremio.json"
docker compose -f compose.yaml -f compose.stremio.yaml up -d --build
```

Le fichier est monté en lecture seule dans `/run/secrets/stremio.json`. Il ne doit jamais être copié dans l’image ou dans `public/`. Voir [`../docs/STREMIO.md`](../docs/STREMIO.md) pour la structure des manifests et les réglages Seerr.

Sans cet override, le serveur démarre sans configuration privée d’addons et permet la connexion Jellyfin. Pour joindre Jellyfin ou Seerr dans un autre conteneur, utiliser une adresse accessible depuis le conteneur Plezy et le réseau Docker approprié.

## Mise à jour

```sh
git pull --ff-only
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 plezy-web
```

Si l’override Stremio est utilisé, conserver les deux options `-f compose.yaml -f compose.stremio.yaml` et la variable `PLEZY_STREMIO_CONFIG` à chaque commande Compose.

Les sources sont intégrées à l’image au moment du build : une mise à jour exige sa reconstruction. Les préférences du navigateur restent liées à son profil et à l’origine du site.

## Tests

```sh
npm test
```

Pour l’exécution hors Docker, installer Node.js 24, FFmpeg et FFprobe, puis lancer `node server.js`. Les tests ne demandent aucun compte réel et n’utilisent pas les clés du VPS.
