# Configurations Plezy sur Umbrel

Instantane du 14 novembre 2026. Export des configurations presentes sur le serveur, sans modification des services.

- `plezy-stremio-permanent`: service web actif (port 18093), qui sert aussi les ressources TV.
- `plezy-vps-migration-test`: instance de test.
- `plezy-web-node`: ancien service, port 8081.
- `plezy-stremio-candidate`: ancien candidat, conserve pour inventaire.
- `plezy-tv-compilation`: configurations de compilation Android, Android TV et Vega disponibles sur Umbrel. Leur presence ne prouve pas qu'elles correspondent a la derniere application installee.

Les fichiers `stremio.example.json` reproduisent la structure, toutes les valeurs textuelles sont a renseigner localement. Ne jamais committer les configurations reelles. Les adresses reseau et chemins sont ceux du deploiement existant.

Exclusions: cles SSH, certificats et signatures, mots de passe, jetons Stremio/Cloudflare, URLs privees des addons, fichiers SDK local.properties, caches de compilation, historiques Git, logs, bases de donnees et sauvegardes. Cloudflare est gere separement dans Umbrel et ses identifiants ne sont pas exportes. Les reglages propres aux profils des televiseurs sont stockes sur les appareils, pas dans ces fichiers.

Restauration: adapter les chemins et adresses, creer localement stremio.json a partir du modele, puis utiliser le compose correspondant. Les Dockerfiles ont besoin du code applicatif : cet export de configuration ne constitue pas a lui seul une sauvegarde executable des applications.
