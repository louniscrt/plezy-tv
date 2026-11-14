# Plezy TV pour Vega

Lanceur WebView React Native / Kepler pour Fire TV Vega. La version des sources est indiquée dans `package.json` et `manifest.toml`.

Au premier lancement, le serveur par défaut est `http://192.168.0.89:8081`. Une adresse enregistrée est conservée, et le lanceur ouvre `/tv/index.html` sur cette origine. Le menu TV permet de choisir une autre adresse HTTPS ou une des adresses locales HTTP autorisées par le manifeste. Les erreurs de chargement d’un média ne remplacent pas l’interface par une erreur de document.

La WebView Vega reçoit directement les flèches et la touche OK quand elle a le focus. L’adaptateur `tv.js` gère ces touches et le focus du catalogue ; aucun second transfert JavaScript n’est ajouté pour éviter les doubles déplacements. `allowSystemKeyEvents` transmet aussi Retour au site.

L’accès HTTP est limité aux deux hôtes explicitement présents dans `manifest.toml` ; HTTPS n’utilise pas cette liste. Aucun privilège de lecture des informations Wi-Fi n’est demandé, car la WebView n’en a pas besoin. Le projet cible les appareils TV avec une interface plein écran paysage ; la documentation Vega consultée ne décrit pas de champ de manifeste ou d’`app.json` pour verrouiller l’orientation, qui doit donc être vérifiée sur l’appareil.

## Tests sans SDK

```sh
npm test
```

Cette commande exécute `prepare.cjs`, puis les tests Node de `test/`. Elle ne nécessite aucune installation npm : l’injection et ses icônes sont générées depuis les ressources Android et web déjà suivies dans le dépôt.

Les fichiers générés `src/injection.json`, `assets/banner.png`, `assets/image/icon.png` et la copie de licence QR code sont exclus de Git. Leurs sources et licences sont conservées dans le dépôt.

## Compilation

Préparer le SDK Amazon Vega / Kepler correspondant aux versions des dépendances et son accès au registre npm, puis installer les dépendances du projet :

```sh
npm install
npm run typecheck
```

Le SDK propriétaire n’est pas fourni dans ce dépôt. Avec ses outils `vega` et le plugin React Native disponibles :

```sh
export KEPLER_SDK_PATH=/chemin/du/sdk/vega
bash build.sh
```

`build.sh` copie les sources dans un répertoire de build sous le cache utilisateur, compile pour `armv7`, lance la validation officielle `vpt` et place le paquet dans `../dist/`.

Options de chemins : `PLEZY_VEGA_BUILD_DIR` pour le répertoire de build et `PLEZY_VEGA_NODE_MODULES` pour réutiliser une installation de dépendances compatible. Les chemins de signature et les informations de compte Amazon doivent rester locaux.

Installer le paquet sur un appareil avec les outils du SDK après activation du mode développeur. Les tests Node ne remplacent pas la vérification des touches physiques, de la WebView et du décodage sur une Fire TV réelle.
