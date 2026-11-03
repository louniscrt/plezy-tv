# 🍿 Plezy TV — Client Natif pour Android TV & Fire TV

<p align="center">
  <img src="plezy-tv-interface.png" alt="Nouvelle Interface Plezy TV" width="850" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Android%20TV%20%7C%20Google%20TV%20%7C%20Fire%20TV-brightgreen?style=for-the-badge&logo=android" alt="Platform" />
  <img src="https://img.shields.io/badge/Language-Kotlin-blue?style=for-the-badge&logo=kotlin" alt="Kotlin" />
  <img src="https://img.shields.io/badge/Min%20SDK-22%20(Android%205.1%2B)-orange?style=for-the-badge" alt="Min SDK" />
  <img src="https://img.shields.io/badge/Jellyfin-10.8%2B-purple?style=for-the-badge&logo=jellyfin" alt="Jellyfin" />
  <img src="https://img.shields.io/badge/Overseerr%20%2F%20Jellyseerr-Intégré-teal?style=for-the-badge" alt="Overseerr" />
  <img src="https://img.shields.io/badge/Version-2.2.0--PlezyTV-red?style=for-the-badge" alt="Version" />
</p>

---

## 🌟 Présentation

**Plezy TV** est une application native Android développée en Kotlin, spécialement conçue et optimisée pour les téléviseurs et boîtiers **Android TV**, **Google TV** et **Amazon Fire TV**.

Elle propose une expérience de streaming moderne, fluide et élégante directement sur grand écran :
* **Connexion Jellyfin** : Parcourez l'intégralité de votre médiathèque personnelle (films, séries, reprises de lecture) avec une lecture matérielle ultra-fluide.
* **Intégration Jellyseerr / Overseerr** : Découvrez les titres du moment, consultez les fiches complètes et lancez des demandes d'ajout de médias en un clic depuis votre télécommande.
* **Nouvelle Interface Grand Écran** : Navigation par onglets supérieurs, Grand Billboard cinématique immersif, capsules de filtrage rapide et rangées avec mise en avant dynamique du média actif.
* **Performance & Légèreté** : Optimisé pour maintenir une fluidité totale à 60 FPS, y compris sur les clés TV d'entrée de gamme ou les anciens Fire TV Sticks dotés de seulement 1 Go de RAM (`minSdk = 22` / Android 5.1+).

---

## 🎨 La Nouvelle Interface

<p align="center">
  <img src="plezy-tv-interface.png" alt="Aperçu de la nouvelle interface" width="800" />
</p>

### ✨ Nouveautés de la version 2.2 :
* **Barre de Navigation Supérieure (Top Bar)** :
  * **Profil Utilisateur** : Avatar d'accès rapide avec switch de compte.
  * **Recherche** : Moteur de recherche instantané couvrant Jellyfin et Seerr.
  * **Onglets dédiés** : *Accueil*, *Séries*, *Films*, *Nouveautés Seerr*, *Ma Liste*.
  * **Pilules de navigation actives** : Mise en valeur lumineuse de la section en cours.
* **Grand Billboard Cinématique (Hero Banner)** :
  * Affiche dynamique plein écran avec dégradés soignés assurant une lisibilité parfaite.
  * Badges exclusifs `[P] FILM` et `[P] SÉRIE`, note TMDB/IMDb, durée, année, classification d'âge et synopsis.
  * Boutons d'action rapides télécommande : `[ ▶ Reprendre / Lecture ]` et `[ ℹ Plus d'infos ]`.
* **Capsules de Catégories** : Boutons de filtrage thématique rapide (*TF1+*, *Nouveautés*, *Action*, *Comédie*...) pour explorer les catalogues en quelques pressions.
* **Rangées Immersives & Rail Top 10** :
  * Affichage des vignettes 16:9 haute définition sans coupure de bord.
  * Rangée `TOP 10` avec chiffres géants détourés façon plateforme de streaming premium.
  * In-Row Expansion lors de la mise au focus à la télécommande.
* **Fiches Détaillées & Sélecteur d'Épisodes** : Choix des saisons et épisodes avec statut de visionnage et synopsis par épisode.
* **Lecteur Vidéo Avancé** : Basé sur Media3/ExoPlayer avec sélection audio multipiste, sous-titres et reprise automatique de la lecture.

---

## 📦 Téléchargement de l'APK

Le fichier d'installation prêt à l'emploi est disponible directement à la racine du dépôt :

| Fichier | Cible | Compatibilité | Téléchargement |
| :--- | :--- | :--- | :--- |
| **`PlezyTV-FireOS-API22.apk`** | Android TV / Google TV / Fire TV | Android 5.1+ (API 22 à 34+) | [📥 Télécharger l'APK](https://github.com/louniscrt/plezy-tv/raw/main/PlezyTV-FireOS-API22.apk) |

---

## 🚀 Guide d'Installation sur Android TV, Google TV & Fire TV

Voici les différentes méthodes pour installer simplement Plezy TV sur votre téléviseur.

### 🥇 Méthode 1 : Via l'application « Downloader » (Recommandée — Sans PC)

Cette méthode est la plus simple et s'effectue directement depuis votre téléviseur à l'aide de la télécommande.

#### Étape 1 : Installer l'application Downloader
1. Ouvrez le **Google Play Store** (sur Android TV / Google TV) ou l'**Amazon Appstore** (sur Fire TV).
2. Recherchez **`Downloader`** (icône orange créée par *AFTVnews*).
3. Cliquez sur **Installer** ou **Obtenir**.

#### Étape 2 : Autoriser l'installation d'applications inconnues
* **Sur Google TV (Chromecast, Sony récents, TCL récents...)** :
  1. Allez dans **Paramètres** (icône d'engrenage) > **Système** > **À propos**.
  2. Descendez sur **Build de l'OS Android TV** et cliquez **7 fois** dessus avec le bouton central de la télécommande jusqu'à ce que le message *« Vous êtes désormais un développeur »* apparaisse.
  3. Retournez dans **Paramètres** > **Applications** > **Sécurité et restrictions** (ou *Accès spécial des applications*).
  4. Sélectionnez **Installer des applications inconnues**, trouvez **Downloader** et activez l'autorisation (**Autorisé**).
* **Sur Android TV classique (Shield TV, Xiaomi Mi Box, Philips...)** :
  1. Allez dans **Paramètres** > **Sécurité et restrictions**.
  2. Activez l'option **Sources inconnues** pour **Downloader**.
* **Sur Amazon Fire TV (Fire TV Stick Lite / 4K / Cube)** :
  1. Allez dans **Paramètres** > **Ma Fire TV** > **Options pour les développeurs**.
     *(Si le menu Options pour les développeurs est masqué : allez dans Ma Fire TV > À propos, et cliquez 7 fois sur le nom de votre appareil)*.
  2. Activez **Applications de sources inconnues** pour **Downloader**.

#### Étape 3 : Télécharger et installer Plezy TV
1. Lancez l'application **Downloader** sur votre téléviseur.
2. Dans le champ URL, saisissez l'adresse directe suivante :
   ```text
   https://github.com/louniscrt/plezy-tv/raw/main/PlezyTV-FireOS-API22.apk
   ```
3. Cliquez sur **Go**. Le téléchargement démarre immédiatement.
4. Une fois le téléchargement terminé, une fenêtre surgit : cliquez sur **Installer**.
5. Cliquez sur **Ouvrir** pour lancer Plezy TV !

---

### 🥈 Méthode 2 : Via l'application « Send Files to TV » ou Clé USB

Si vous préférez télécharger l'APK depuis votre téléphone Android ou votre ordinateur :

1. Téléchargez le fichier [`PlezyTV-FireOS-API22.apk`](https://github.com/louniscrt/plezy-tv/raw/main/PlezyTV-FireOS-API22.apk) sur votre smartphone ou PC.
2. Installez l'application **Send Files to TV** sur votre téléviseur et sur votre smartphone depuis le Google Play Store.
3. Envoyez le fichier APK vers votre téléviseur.
4. Sur votre TV, utilisez un gestionnaire de fichiers gratuit (ex: *FX File Explorer*, *X-plore* ou *File Commander*) pour ouvrir le dossier **Download** et installer l'APK.

---

### 🥉 Méthode 3 : Installation rapide via ADB (PC / Mac)

Pour les utilisateurs avancés disposant d'un ordinateur connecté au même réseau Wi-Fi que la TV :

1. Activez le **Débogage ADB** dans les options développeur de votre téléviseur.
2. Repérez l'adresse IP de votre téléviseur (ex: `192.168.1.50`).
3. Depuis votre terminal PC :
   ```bash
   adb connect <IP_DE_VOTRE_TV>:5555
   adb install -r PlezyTV-FireOS-API22.apk
   ```
*(Sous Windows, vous pouvez également exécuter le script automatique [`sideload-firetv.bat`](sideload-firetv.bat)).*

---

### 🛠️ Méthode 4 : Compilation manuelle depuis les sources

Pour compiler vous-même le code source avec Android Studio :

1. Clonez ce dépôt :
   ```bash
   git clone https://github.com/louniscrt/plezy-tv.git
   cd plezy-tv
   ```
2. Ouvrez le dossier dans **Android Studio** (Ladybug ou supérieur recommandé).
3. Laissez Gradle synchroniser les dépendances (SDK 22 à 34).
4. Lancez la compilation :
   ```bash
   ./gradlew assembleDebug
   ```
5. Retrouvez l'APK généré dans : `app/build/outputs/apk/debug/app-debug.apk`.

---

## ⚙️ Configuration au Premier Démarrage

### 1. Connexion à Jellyfin
* Au premier lancement, entrez l'URL complète de votre serveur Jellyfin :
  * Exemple local : `http://192.168.1.100:8096`
  * Exemple domaine sécurisé : `https://jellyfin.mondomaine.fr`
* Connectez-vous avec vos identifiants utilisateur habituels ou profitez du **Quick Connect** si activé sur votre instance.

### 2. Connexion à Jellyseerr / Overseerr (Optionnel mais recommandé)
* Rendez-vous dans la section **Nouveautés Seerr** ou dans les paramètres depuis l'avatar de profil.
* Saisissez l'adresse de votre instance Seerr (ex: `http://192.168.1.100:5055` ou `https://seerr.mondomaine.fr`).
* Renseignez votre **clé d'API Seerr** (disponible dans *Paramètres > Général > Clé d'API* de Seerr) ou connectez-vous avec vos identifiants.
* Vous pouvez dès lors chercher n'importe quel film ou série non encore présent sur Jellyfin et envoyer une demande de téléchargement direct depuis votre canapé !

---

## 📺 Matériels Compatibles Testés

* **Google TV & Android TV** :
  * Chromecast avec Google TV (HD et 4K)
  * Nvidia Shield TV / Shield TV Pro
  * Xiaomi Mi Box S, Xiaomi TV Box S (2nd Gen), Mi TV Stick 4K
  * Smart TV Sony Bravia (Google TV)
  * Smart TV TCL, Philips Ambilight, Hisense Android TV
  * Nokia Streaming Box, Strong Leap, Formuler
* **Amazon Fire TV** :
  * Fire TV Stick 4K Max (1ère et 2nde génération)
  * Fire TV Stick 4K, Fire TV Stick standard (3ème gén), Fire TV Stick Lite
  * Fire TV Cube (toutes générations)
  * Téléviseurs connectés Amazon Fire TV Edition (TCL, Grundig, Xiaomi)

---

## 🧹 Outils Additionnels : Optimisation Fire TV

Ce dépôt inclut également la suite d'optimisation **CleanYourTV** pour débloquer les performances maximales des clés Fire TV :
* **[`cleanyour-tv-debloat.ps1`](cleanyour-tv-debloat.ps1)** : Désactive la télémétrie Amazon, désinstalle les bloatwares inutiles en arrière-plan et libère jusqu'à 37% de mémoire vive.
* **[`restore-firetv.ps1`](restore-firetv.ps1)** : Permet de rétablir les réglages par défaut de la Fire TV en une commande.

---

## 📄 Licence & Contribution

Projet distribué sous licence **MIT**. Les contributions, signalements de bugs et suggestions via les Issues ou Pull Requests sont les bienvenues !
