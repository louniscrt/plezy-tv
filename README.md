# 🍎 Plezy TV — Client Jellyfin & Overseerr pour Fire TV & Android TV

<p align="center">
  <img src="tv-home.BrkdGMKi.avif" alt="Plezy TV Accueil" width="800" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Android%20TV%20%7C%20Fire%20OS-brightgreen?style=for-the-badge&logo=android" alt="Platform" />
  <img src="https://img.shields.io/badge/Language-Kotlin-blue?style=for-the-badge&logo=kotlin" alt="Kotlin" />
  <img src="https://img.shields.io/badge/Min%20SDK-22%20(Fire%20OS%205%2B)-orange?style=for-the-badge" alt="Min SDK" />
  <img src="https://img.shields.io/badge/Jellyfin-10.8%2B-purple?style=for-the-badge&logo=jellyfin" alt="Jellyfin" />
  <img src="https://img.shields.io/badge/Overseerr%20%2F%20Seerr-Ready-teal?style=for-the-badge" alt="Overseerr" />
  <img src="https://img.shields.io/badge/Style-Infuse%208%20%2F%20Apple%20TV-lightgrey?style=for-the-badge&logo=apple" alt="Apple TV UI" />
</p>

---

## 🌟 Présentation

**Plezy TV** est une application Android TV / Fire TV native en **Kotlin** conçue pour offrir l'expérience visuelle fluide et élégante d'**Infuse 8** et d'**Apple TV** sur vos appareils de salon, tout en étant connectée à votre propre serveur **Jellyfin** et à votre catalogue de requêtes **Overseerr / Jellyseerr**.

L'application a été spécialement pensée et architecturée pour tourner avec une fluidité absolue (60 FPS, zéro ralentissement) sur les appareils d'entrée de gamme à mémoire très limitée (**Fire TV Stick 1 Go de RAM**, Fire OS 5 / Android 5.1 Lollipop minimum).

---

## ✨ Fonctionnalités Clés

### 🎨 1. Interface "Liquid Glass" (Apple TV & Infuse 8)
* **Design Verre Dépoli (Frosted Glass)** : Arrière-plans sombres translucides, dégradés d'ombrage dynamiques et cartes à coins arrondis élégantes.
* **Hero Banner immersif** : En-tête grand format avec mise à jour instantanée du fond d'écran au survol, métadonnées complètes (Note IMDb/TMDB, classification d'âge, durée, année, genres et synopsis).
* **Navigation fluide au D-Pad** : Effet de focus avec contour lumineux blanc, mise à l'échelle douce et transitions réactives adaptées à la télécommande.
* **Rails personnalisés** :
  * *Reprendre la lecture* (Continue Watching) avec barre de progression de lecture intégrée.
  * *Récemment ajoutés* (Séries & Films séparés).
  * *Catalogue Bibliothèque* avec filtres et grille dynamique.

### 🎬 2. Lecteur Vidéo Haute Précision
* **Timeline par Chapitres** : Scrubber découpé en segments selon les chapitres du média avec titres et marqueurs de position.
* **Calculateur d'heure de fin** : Indication dynamique de l'heure à laquelle le média se terminera (*Ends at 23:45*).
* **Contrôles OSD épurés** : Recul / Avance rapide (-10s / +10s), Play/Pause instantané, sélection des pistes audio et sous-titres directement à la télécommande.
* **Détection Intelligente des Codecs (`CodecDetector`)** :
  * **Direct Play matériel** pour tous les flux `H.264 / AVC ≤ 1080p`.
  * **Transcodage automatique HLS (`master.m3u8`)** côté serveur Jellyfin pour les formats trop lourds (`HEVC/H.265`, `AV1`, `VP9`, `4K`), évitant les crashs matériels sur les anciens sticks TV.

### 🔍 3. Intégration Native Overseerr / Jellyseerr
* **Découverte intégrée** : Parcourez les tendances, les films et séries populaires du moment sans quitter l'interface TV.
* **Demande en 1 Clic** : Envoyez instantanément vos requêtes vers **Overseerr / Jellyseerr**, qui les transmet automatiquement à **Radarr / Sonarr / Transmission**.
* **Statut de disponibilité en direct** : Badges clairs (*Disponible*, *Demandé*, *En cours de traitement*).

### ⚡ 4. Optimisations Matérielles Stick 1 Go RAM
* **Empreinte mémoire divisée par 2** : Configuration de **Glide** en décodage `RGB_565` (16 bits par pixel au lieu de 32 bits).
* **Cache mémoire strict** : Cache mémoire d'images plafonné à 16 Mo, avec libération agressive sur événement système `onTrimMemory`.
* **Tampon ExoPlayer calibré** : Buffer vidéo limité à 12 Mo (15 secondes max) pour garantir qu'aucun débordement de mémoire (*OutOfMemory*) ne survienne lors de la lecture.

### 🧹 5. Suite Débloat CleanYourTV Intégrée
Le projet inclut une suite complète d'optimisation Fire TV basée sur l'architecture de **[CleanYourTV](https://cleanyour.tv/)** :
* **[`cleanyour-tv-debloat.ps1`](cleanyour-tv-debloat.ps1)** :
  * Désactivation de l'ID publicitaire Amazon, du suivi et de la télémétrie.
  * Suppression de l'économiseur d'écran vidéo publicitaire (gain direct de 100 Mo de RAM).
  * Mode "Zero-Lag UI" (échelle d'animations système à 0.0 ms pour une réactivité instantanée).
  * Arrêt et purge de 39 applications bloatware d'arrière-plan (+37% de RAM disponible mesurée).
* **[`restore-firetv.ps1`](restore-firetv.ps1)** : Script de réversibilité à 100% permettant de remettre la Fire TV dans son état constructeur d'origine en une commande.

---

## 📸 Aperçu de l'Interface

| Écran d'Accueil (tv-home) | Détails Média & Saisons (tv-md) |
| :---: | :---: |
| ![Accueil](tv-home.BrkdGMKi.avif) | ![Détails](tv-md.CZ1_57Nl.avif) |

| Bibliothèque Complète (tv-library) | Lecteur Vidéo Infuse (tv-player) |
| :---: | :---: |
| ![Bibliothèque](tv-library.CbMuh8Nq.avif) | ![Lecteur](tv-player.C8UjHqPn.avif) |

---

## 🛠️ Structure du Projet

```text
app-firetv/
├── app/
│   ├── build.gradle.kts           # Configuration Android SDK (minSdk 22, targetSdk 28)
│   └── src/main/
│       ├── AndroidManifest.xml    # Déclarations Leanback, activités et permissions TV
│       ├── java/com/plezy/jellyfin/
│       │   ├── PlezyApp.kt        # Initialisation Glide basse mémoire & purge RAM
│       │   ├── data/
│       │   │   ├── api/           # Clients JellyfinClient & SeerrClient (OkHttp / REST)
│       │   │   └── model/         # Modèles de données (Média, Saisons, Épisodes, Requêtes)
│       │   ├── ui/
│       │   │   ├── login/         # Connexion serveur & Quick Connect
│       │   │   ├── main/          # Écran d'accueil, rails horizontaux & bibliothèque
│       │   │   ├── detail/        # Fiche média avec sélection des saisons/épisodes & Overseerr
│       │   │   └── player/        # Lecteur ExoPlayer, scrubber de chapitres & OSD
│       │   └── util/              # CodecDetector, formatters et gestionnaires D-pad
│       └── res/                   # Layouts XML, styles Liquid Glass, drawables & chaînes
├── cleanyour-tv-debloat.ps1       # Script PowerShell d'optimisation Fire TV Stick (CleanYourTV)
├── restore-firetv.ps1             # Script PowerShell de restauration d'origine
├── sideload-firetv.bat            # Script de déploiement ADB automatique en un clic
├── build.gradle.kts               # Configuration racine Gradle
└── settings.gradle.kts            # Définition des modules et dépôts
```

---

## 🚀 Installation & Déploiement

### Option A : Déploiement rapide via ADB (Sideload)
Si votre Fire TV Stick est connectée au même réseau local Wi-Fi et que le débogage ADB est activé :

1. Connectez-vous à la Fire TV :
   ```bash
   adb connect <IP_DE_VOTRE_FIRE_TV>:5555
   ```
2. Installez l'APK précompilé :
   ```bash
   adb install -r PlezyTV-FireOS-API22.apk
   ```
*(Ou lancez simplement le fichier [`sideload-firetv.bat`](sideload-firetv.bat)).*

### Option B : Compilation depuis les sources (Android Studio)
1. Clonez ce dépôt :
   ```bash
   git clone https://github.com/votre-compte/plezy-tv.git
   ```
2. Ouvrez le projet dans **Android Studio** (Koala / Ladybug ou supérieur).
3. Laissez Gradle synchroniser les dépendances.
4. Lancez la compilation :
   ```bash
   ./gradlew assembleDebug
   ```
5. L'APK généré se trouvera dans `app/build/outputs/apk/debug/app-debug.apk`.

---

## ⚙️ Configuration Initiale

1. **Serveur Jellyfin** :
   * Au premier démarrage de l'application, saisissez l'adresse de votre serveur (ex: `http://jellyfin.local:8096`, `http://<SERVER_IP>:8096` ou votre nom de domaine).
   * Connectez-vous avec vos identifiants ou utilisez **Quick Connect**.
2. **Jellyseerr / Overseerr** :
   * Dans l'interface, accédez à la section Seerr pour associer votre instance (`http://<SEERR_IP>:5055` ou nom de domaine).
   * Vos demandes de médias seront instantanément répercutées dans vos services de téléchargement automatisés (Radarr/Sonarr).

---

## 📄 Licence

Ce projet est sous licence **MIT**. Vous êtes libre de l'utiliser, le modifier et le distribuer selon vos besoins.
