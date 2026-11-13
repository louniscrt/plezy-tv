# Application Android native historique

Client Kotlin / Media3, paquet `com.plezy.jellyfin`, conservé avec son APK `PlezyTV-FireOS-API22.apk` à la racine pour les installations existantes.

Les lanceurs Android TV / Xiaomi et Vega qui utilisent le site sont dans [`../smart-tv/`](../smart-tv/). Les correctifs du lecteur web sont dans [`../webapp/`](../webapp/) et ne reconstruisent pas cet APK natif.

La compilation native utilise Java 17, Gradle 8.4 et le SDK Android 34 :

```sh
gradle --no-daemon assembleDebug testDebugUnitTest lintDebug
```

Le script [`../tools/build-on-umbrel.sh`](../tools/build-on-umbrel.sh) fournit aussi une compilation Docker. Les addons privés sont décrits dans [`../docs/STREMIO.md`](../docs/STREMIO.md).
