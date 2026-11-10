# Plezy Web

Adaptation de Plezy TV pour PC, téléphone et tablette, à partir de l’interface et des clients API présents dans le projet Android et Vega. Les fichiers des applications TV ne sont pas modifiés.

## Démarrer

Node.js 20 ou plus récent suffit. Aucune installation de dépendances et aucune compilation ne sont nécessaires.

```powershell
cd C:\Users\lounis\Downloads\app-firetv
node webapp/server.js
```

Vous pouvez aussi double-cliquer sur `webapp/start.bat` : le lanceur démarre le serveur en arrière-plan, attend qu’il réponde, puis ouvre la bonne adresse dans votre navigateur. Les journaux sont dans `webapp/server.log` et `webapp/server-error.log`. Avec la commande manuelle ci-dessus, gardez le terminal ouvert pendant l’utilisation.

N’ouvrez pas directement `public/index.html` : une adresse `file://` ne peut pas utiliser le relais de connexion. Utilisez toujours l’adresse HTTP de Plezy.

- PC : http://localhost:8090
- Téléphone / tablette : utilisez l’adresse réseau affichée par le serveur, sur le même Wi-Fi que le PC. Autorisez Node sur le réseau privé si Windows le demande.
- Pour limiter l’accès au PC : `$env:HOST='127.0.0.1'` avant le lancement.
- Pour changer le port : `$env:PORT='8091'` avant le lancement.

Le serveur sert également de relais pour Jellyfin et Seerr afin de gérer les appels API, les cookies de session, les images et les flux vidéo sans configuration CORS sur ces services. Utilisez-le sur votre réseau privé. Pour un accès extérieur, placez-le derrière un reverse proxy HTTPS avec contrôle d’accès ; le relais n’est pas un service public authentifié.

## Hébergement Docker

Utilisez le `Dockerfile` et `compose.yaml` fournis pour exécuter **le serveur Node.js et l’interface ensemble**. Depuis ce dossier, `docker compose up -d --build` publie Plezy sur le port **8081** du serveur. Un conteneur Nginx contenant uniquement `public/` ne peut pas assurer la connexion : la route `/proxy` est indispensable. La procédure complète et les vérifications réseau sont dans [DEPLOY-DOCKER.md](DEPLOY-DOCKER.md).

## Connexion et utilisation

Saisissez l’adresse de Jellyfin puis vos identifiants, ou générez un code Quick Connect et autorisez-le depuis Jellyfin → Profil → Quick Connect. Les chemins de reverse proxy, par exemple `https://media.example/jellyfin`, sont conservés.

Le mode démo reprend la sélection de présentation Vega avec ses illustrations d’ambiance. Les titres de démonstration ne constituent pas une bibliothèque réelle : leur bouton Lecture utilise l’extrait public **Tears of Steel**, de la Blender Foundation. Les vrais titres, affiches, notes, acteurs et épisodes proviennent de votre serveur après connexion.

Dans les réglages, connectez Seerr avec sa clé API ou un compte local. L’onglet Seerr propose les tendances, films et séries populaires et les prochaines sorties. Les demandes affichent une confirmation avant envoi. La disponibilité partielle d’une série est distinguée de sa disponibilité complète.

L’accueil comporte la reprise, les ajouts récents, les tendances Seerr, votre liste, les mieux notés et les genres. Les fiches donnent accès aux saisons, épisodes, acteurs, bandes-annonces, favoris et statuts vu/non vu. La liste Plezy est locale et séparée par serveur et profil ; les favoris et la progression sont synchronisés avec Jellyfin.

Les fiches reprennent les références du dossier `ressources` : fenêtre centrée sur PC au-dessus du catalogue, grand visuel avec logo et reprise, informations en deux colonnes, épisodes numérotés avec vignette, durée et synopsis, puis suggestions et distribution lorsqu’elles sont disponibles. Sur téléphone, la fiche occupe toute la largeur et les épisodes restent présentés en liste. Le bouton principal d’une série reprend l’épisode en cours ou lance le prochain épisode proposé par Jellyfin. Le choix d’une autre saison conserve la cible de reprise.

## Lecteur

Le lecteur négocie la lecture avec l’API `PlaybackInfo` de Jellyfin, à partir des formats réellement pris en charge par le navigateur. Il utilise la source, le flux et l’identifiant de session retournés par le serveur. Les fichiers compatibles se lisent directement ; les autres passent par HLS H.264/AAC. Audio, sous-titres incrustés, qualité, vitesse, chapitres, format d’image, volume, plein écran et épisode suivant sont disponibles selon le média. HLS.js est inclus localement avec sa licence dans `public/vendor`.

L’interface comporte une barre de progression rouge et les commandes en bas de l’écran. En pause, elle affiche le titre, l’épisode et le synopsis. Sur téléphone, les commandes sont regroupées sur deux lignes et les réglages secondaires restent accessibles dans le menu.

Le serveur Jellyfin doit autoriser et réussir le transcodage pour les formats non pris en charge et les changements de pistes. Si les segments HLS échouent, Plezy vérifie aussi l’accès au fichier original et affiche les codes d’erreur utiles. Si le même titre échoue dans l’interface Jellyfin officielle, vérifiez les fichiers et montages de la bibliothèque ainsi que les journaux FFmpeg sur le serveur. Le bouton d’aide du lecteur permet de réessayer le fichier original ou une qualité compatible.

Pour diagnostiquer le relais, lancez `$env:PLEZY_DEBUG_STREAMS='1'; node webapp/server.js` depuis la racine du projet. Les journaux indiquent les chemins des flux, leurs statuts et les octets transférés, sans enregistrer de jeton ni le contenu des vidéos.

Raccourcis : Espace = lecture/pause, flèches gauche/droite = ±10 s, F = plein écran, M = couper le son, Échap = retour. Les contrôles et les menus sont accessibles par Tabulation et Entrée.

## Installation et hors connexion

Sur HTTPS ou localhost, utilisez « Installer l’application » dans le navigateur. Sur iPhone/iPad, ouvrez Safari puis Partager → Sur l’écran d’accueil. Une adresse HTTP du réseau local permet l’utilisation web, mais ne donne généralement pas accès à l’installation PWA ni au stockage hors connexion.

Dans le menu « Plus » d’un film ou épisode, choisissez « Télécharger sur cet appareil ». Le téléchargement écrit le fichier directement dans le stockage privé du navigateur, sans charger toute la vidéo en mémoire. Les téléchargements apparaissent dans Mon Plezy, avec leur fiche et illustration. La lecture locale prend en charge la recherche dans la vidéo grâce aux requêtes HTTP Range.

Cette fonction exige un navigateur prenant en charge OPFS, un service worker actif et suffisamment d’espace. Les fichiers doivent être au format MP4/M4V ou WebM, avec des codecs lisibles par le navigateur. La sélection de pistes ou le transcodage reste réservé à la lecture depuis Jellyfin. Les téléchargements ne sont pas transférés entre appareils et peuvent être supprimés si les données du navigateur sont effacées. Utilisez le même profil et la même adresse Plezy pour les retrouver.

L’interface est mise en cache pour pouvoir s’ouvrir hors connexion. Les réponses API, jetons et vidéos du relais ne sont jamais stockés dans ce cache. Le mot de passe de connexion n’est pas enregistré ; les jetons Jellyfin et sessions Seerr sont conservés dans le stockage local du navigateur jusqu’à la déconnexion.

## Vérifications

```powershell
npm test --prefix webapp
```

Les tests utilisent des serveurs simulés : ressources, erreurs réseau/API, authentification, cookies Seerr, conversion des fiches, normalisation d’URL, playlists HLS, redirections, plages vidéo et lecture des fichiers hors connexion. La validation avec un vrai compte Jellyfin/Seerr et les codecs de ses médias doit être faite sur vos appareils.

Les illustrations de démonstration reprennent les photographies Unsplash référencées par le bundle Vega fourni. Les polices Inter proviennent des ressources de l’application fournie. L’extrait vidéo de démonstration nécessite Internet.

## Connexion Seerr et bibliothèque automatique

Plezy conserve la clé API ou la session Seerr sur cet appareil, fusionne les cookies partiellement renouvelés et vérifie la connexion toutes les deux minutes lorsque l’application est active. Un échec réseau ne supprime ni la connexion Seerr ni la connexion Jellyfin. Les mots de passe ne sont pas enregistrés. Une clé API valide est le choix durable ; une session révoquée ou supprimée côté Seerr exige une nouvelle connexion.

Le catalogue est actualisé toutes les 120 secondes, en gardant la position et la sélection. Pendant un film, une fiche, la recherche ou une saisie, l’actualisation de l’affichage est différée au retour au catalogue. Après une mise en veille, une actualisation est faite si l’intervalle est écoulé. Les médias doivent déjà être indexés et accessibles dans Jellyfin : ce contrôle ne déclenche pas un scan complet de votre serveur.
