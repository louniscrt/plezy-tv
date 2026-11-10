# Plezy sur votre serveur Docker

Configuration préparée pour la web app sur **http://192.168.0.89:8081** et Jellyfin sur **http://192.168.0.89:8096**.

## Pourquoi la connexion échoue avec le conteneur Nginx actuel

Plezy utilise deux parties : l’interface du dossier `public` et le relais Node.js de `server.js`. Les connexions Jellyfin/Seerr, les images et les vidéos passent par `/proxy` sur le même serveur que l’interface.

Un conteneur Nginx servant seulement des fichiers ne démarre pas ce relais : `/proxy` renvoie 404. Le conteneur fourni ici exécute Node.js et sert les deux parties ensemble. Aucun mot de passe ni jeton Jellyfin n’est à mettre dans Docker.

## Installation

1. Extrayez l’archive `plezy-web-docker.zip` dans un dossier dédié sur le serveur. `Dockerfile`, `compose.yaml`, `server.js` et `public/` doivent se trouver dans ce même dossier.
2. Arrêtez le conteneur Nginx qui utilise actuellement le port **8081**, depuis votre gestionnaire Docker. Conservez ses fichiers et sa configuration.
3. Ouvrez un terminal sur le serveur, dans le dossier extrait, et lancez :

```sh
docker compose up -d --build
```

4. Ouvrez **http://192.168.0.89:8081/** et renseignez **http://192.168.0.89:8096** pour Jellyfin.

Il n’est pas nécessaire de monter le dossier des films dans le conteneur Plezy : il récupère les médias depuis Jellyfin. Ne montez pas un dossier sur `/app/public` sans y placer l’intégralité des ressources de l’interface.

L’archive se déploie à la racine du port 8081 : n’ajoutez pas `/public/index.html` à l’adresse de la web app.

## Vérifier les deux parties

Sur le serveur, ou depuis un autre appareil du même réseau :

```sh
curl -i http://192.168.0.89:8081/health
```

Réponse attendue : HTTP 200 avec `{"service":"plezy-web","status":"ok","relay":true}`. Un 404 ou une page Nginx indique que le trafic n’arrive pas au nouveau conteneur.

Pour vérifier que le relais atteint bien Jellyfin, sans identifiant :

```sh
curl -i 'http://192.168.0.89:8081/proxy?url=http%3A%2F%2F192.168.0.89%3A8096%2FSystem%2FInfo%2FPublic'
```

Réponse attendue : HTTP 200 avec les informations publiques de Jellyfin. Un 502 indique que le conteneur Plezy ne peut pas joindre Jellyfin : vérifiez l’adresse, le port 8096 publié sur le serveur et les règles réseau Docker/pare-feu.

Pour consulter l’état et les journaux :

```sh
docker compose ps
docker compose logs --tail=100 plezy-web
```

Les navigateurs doivent se reconnecter après un changement d’adresse de la web app : une session ouverte sur `localhost:8090` n’est pas automatiquement transférée à `192.168.0.89:8081`.

## Mise à jour

Remplacez les fichiers par ceux de la nouvelle archive, puis relancez `docker compose up -d --build`. L’image et le conteneur doivent être reconstruits pour intégrer les fichiers mis à jour. Les paramètres et listes Plezy restent conservés dans le navigateur.

## Portainer

Ce fichier Compose utilise `build: .` et doit être exécuté dans le dossier des sources. Le coller seul dans l’éditeur de stack Portainer ne fournit pas les sources nécessaires. Dans ce cas, construisez d’abord l’image sur le serveur (`docker compose build`) puis utilisez une stack avec `image: plezy-web:local` à la place de `build: .`, sur le même moteur Docker. Les autres paramètres restent identiques.

## Connexion Seerr et bibliothèque automatique

Plezy conserve la clé API ou la session Seerr sur cet appareil, fusionne les cookies partiellement renouvelés et vérifie la connexion toutes les deux minutes lorsque l’application est active. Un échec réseau ne supprime ni la connexion Seerr ni la connexion Jellyfin. Les mots de passe ne sont pas enregistrés. Une clé API valide est le choix durable ; une session révoquée ou supprimée côté Seerr exige une nouvelle connexion.

Le catalogue est actualisé toutes les 120 secondes, en gardant la position et la sélection. Pendant un film, une fiche, la recherche ou une saisie, l’actualisation de l’affichage est différée au retour au catalogue. Après une mise en veille, une actualisation est faite si l’intervalle est écoulé. Les médias doivent déjà être indexés et accessibles dans Jellyfin : ce contrôle ne déclenche pas un scan complet de votre serveur.

Pour appliquer cette mise à jour au serveur actuellement utilisé, transférez l’archive depuis PowerShell :

```powershell
scp "C:\Users\lounis\Downloads\app-firetv\webapp\deploy\plezy-web-docker.zip" umbrel@192.168.0.89:/home/umbrel/
```

Puis dans la session SSH :

```bash
sudo docker run --rm --user "$(id -u):$(id -g)" --mount type=bind,source=/home/umbrel/plezy-web-docker.zip,target=/package.zip,readonly --mount type=bind,source=/home/umbrel/plezy-web-node,target=/output python:3-alpine python -m zipfile -e /package.zip /output
cd /home/umbrel/plezy-web-node
sudo docker compose up -d --build
```

Actualisez ensuite la page du navigateur. Les données de connexion stockées sur cet appareil restent conservées.

## Connexion Seerr par QR code

Dans Plezy, ouvrir Réglages → Connexion à Seerr → Connecter Seerr avec mon téléphone. Scanner le QR code sur le même Wi-Fi, vérifier le code à six chiffres, puis coller la clé API ou utiliser le compte local Seerr. Le serveur valide la connexion et la TV la récupère automatiquement. Le QR expire en cinq minutes et fonctionne une seule fois. Il ne contient aucune clé API. Les mots de passe ne sont pas conservés. Les échanges sont temporaires en mémoire et sont supprimés après récupération, annulation ou expiration.

Cette fonction exige de reconstruire le conteneur Node avec `pairing.js` et les nouvelles pages `connect.html`, `connect.js`, `connect.css`. Le paquet Docker de ce dossier les contient. Utiliser l’adresse LAN de Plezy (192.168.0.89:8081), et non localhost sur le téléphone.
