# Lecture Stremio / Real-Debrid dans Plezy

Les films et épisodes se lisent dans le lecteur Plezy existant. Les écrans, styles et ressources visuelles restent identiques. Le mode Jellyfin / Seerr continue de fonctionner sans configuration Stremio.

Stremio ne fournit pas de clé API centrale : les addons exposent un `manifest.json`, des catalogues, des métadonnées et des liens `stream`. Une clé Real-Debrid seule ne constitue pas un catalogue. Un addon configuré pour votre compte fournit les liens HTTP(S) utilisés par le lecteur intégré.

## Configuration privée

Python 3 est nécessaire uniquement pour cet assistant de configuration :

```sh
python tools/configure-stremio.py --add
```

La clé est demandée avec saisie masquée. L'assistant configure Torrentio pour Real-Debrid et permet d'ajouter autant de manifests supplémentaires que souhaité. Comet, MediaFusion, Jackettio et les autres addons compatibles doivent être configurés auprès de leur fournisseur ; copiez leur adresse `manifest.json` à l'invite masquée. Un addon peut contenir vos identifiants dans son URL : ne la publiez pas. La clé est transmise aux fournisseurs d'addons que vous configurez, conformément à leur fonctionnement.

Le fichier est créé par défaut dans `~/.config/plezy/stremio.json`. Ne le placez jamais dans `public`, dans l'APK, ni dans GitHub. Les fichiers nommés `stremio.json` et `stremio.local.json` sont ignorés par Git. Une clé envoyée dans une conversation doit être régénérée avant utilisation durable.

Format accepté (exemple sans identifiants) :

```json
{
  "metadataManifest": "https://v3-cinemeta.strem.io/manifest.json",
  "addons": []
}
```

Chaque entrée `addons` accepte une URL de manifest ou un objet `{"manifestUrl":"https://votre-addon/manifest.json"}`. Cinemeta fournit les fiches et le catalogue ; `metadataManifest: false` désactive cet ajout. Aucun addon n'est activé sans configuration privée.

## Android TV / Fire TV

1. Installez l'APK `PlezyTV-FireOS-API22.apk` puis ouvrez Plezy une fois.
2. Connectez le téléviseur avec ADB, puis lancez :

   ```sh
   python tools/configure-stremio.py --android --add
   ```

   Pour réutiliser le fichier existant sans le recréer :

   ```sh
   adb shell mkdir -p /sdcard/Android/data/com.plezy.jellyfin/files
   adb push CHEMIN_PRIVE/stremio.json /sdcard/Android/data/com.plezy.jellyfin/files/stremio.json
   adb shell am force-stop com.plezy.jellyfin
   ```

3. Rouvrez Plezy. Les catalogues alimentent les rangées existantes ; le bouton Lecture utilise les addons. Aucune connexion Jellyfin n'est nécessaire en mode Stremio seul. Retirez le fichier et relancez l'application pour désactiver ce mode.

Les favoris et la reprise Stremio sont conservés localement, séparément de Jellyfin. Les autres liens disponibles sont essayés si un flux échoue. Les téléchargements directs sans en-têtes particuliers restent disponibles ; les playlists HLS ne sont pas téléchargées hors connexion.

L'APK fourni est une compilation de développement. Une mise à jour d'une installation existante exige la même clé de signature que l'ancien APK. Sans cette clé, Android refuse la mise à jour : sauvegardez vos données avant toute réinstallation. Ne désinstallez pas automatiquement l'application.

## Web, mobile et page TV

Node 20+ ; aucune dépendance npm à installer :

```sh
cd webapp
# Linux / macOS
STREMIO_CONFIG_FILE="$HOME/.config/plezy/stremio.json" npm start
```

PowerShell :

```powershell
$env:STREMIO_CONFIG_FILE = "$HOME\.config\plezy\stremio.json"
cd webapp
npm start
```

Le serveur lit le fichier au démarrage. Redémarrez-le après modification. Les pages `/` et `/tv/` utilisent les mêmes addons et conservent leur présentation. Les manifests et jetons restent côté serveur ; les flux passent par des liens temporaires opaques. Les cookies et jetons Jellyfin ne sont pas transmis aux flux Stremio. Les favoris et reprises Stremio sont stockés dans le navigateur.

Docker : l'image inclut `stremio.js`. Montez le fichier privé en lecture seule (par exemple `/run/secrets/stremio.json`) et définissez `STREMIO_CONFIG_FILE` avec ce chemin. Ne copiez pas le fichier dans l'image. Les requêtes d'API et les flux ne sont pas mis en cache par le service worker.

## Compatibilité et vérification

- Manifests HTTP(S), ressources sous forme de chaînes ou d'objets, filtres de type et de préfixe d'identifiant.
- Catalogues et recherche agrégés, doublons supprimés par type/identifiant. Épisodes identifiés par l'addon, dont les identifiants IMDb `tt…:saison:épisode`.
- Jusqu'à quatre requêtes simultanées, délais limités, cache court et isolation des erreurs de chaque addon.
- Lecture directe HTTP(S), y compris les liens Real-Debrid fournis par les addons. Les liens torrent `infoHash` seuls, les liens externes et `notWebReady` ne sont pas lus : aucun moteur BitTorrent n'est inclus.
- Le nombre de catalogues ne garantit pas la disponibilité d'un programme. Les codecs doivent être compatibles avec le navigateur ou le téléviseur ; Real-Debrid ne remplace pas le transcodage Jellyfin.
- Un abonnement actif et des addons configurés sont nécessaires. Les tests avec serveurs simulés valident le protocole et la lecture intégrée ; ils ne prouvent pas l'accès à un compte réel.

```sh
# Android, après activation de Java 17 / Gradle 8.4 / SDK 34
gradle --no-daemon --max-workers=2 assembleDebug testDebugUnitTest lintDebug
# Web
cd webapp
npm test
```

Dans un environnement cloud à réseau restreint, autorisez les domaines de vos addons ainsi que `v3-cinemeta.strem.io`. Torrentio utilise `torrentio.strem.fun`. Les domaines des médias et des images retournés par les addons doivent aussi être accessibles ; aucune liste fixe ne couvre tous les fournisseurs.

Une adresse Jellyfin peut être préremplie à la compilation avec `-Pplezy.jellyfinServerUrl=http://ADRESSE:8096`. Cette option ne contient aucun mot de passe. Le mot de passe d’administration Umbrel ne sert pas à authentifier un utilisateur Jellyfin. L’accès à une adresse Tailscale nécessite que l’appareil exécutant Plezy soit connecté au même réseau privé.
