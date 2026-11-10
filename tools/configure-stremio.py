#!/usr/bin/env python3
"""Create private addon configuration without putting Real-Debrid tokens in source or APKs."""
import argparse
import getpass
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import quote, urlsplit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path.home() / '.config' / 'plezy' / 'stremio.json')
    parser.add_argument('--add', action='store_true', help='Prompt for additional configured Stremio manifests')
    parser.add_argument('--android', action='store_true', help='Copy configuration to an installed Android app using adb')
    args = parser.parse_args()
    target = args.output.expanduser().resolve()
    if 'public' in target.parts:
        parser.error('Le fichier privé doit rester hors du dossier public.')
    if target.exists() and input('Remplacer la configuration privée existante ? [o/N] ').strip().lower() != 'o':
        return
    token = getpass.getpass('Clé Real-Debrid (saisie masquée) : ').strip()
    if not token or not token.isascii() or not token.isalnum():
        parser.error('Clé invalide.')
    addons = ['https://torrentio.strem.fun/realdebrid=' + quote(token, safe='') + '/manifest.json']
    if args.add:
        print('Ajoutez les manifests configurés avec votre compte (Comet, MediaFusion, Jackettio, etc.). Entrée vide pour terminer.')
        while True:
            manifest = getpass.getpass('Manifest supplémentaire (saisie masquée) : ').strip()
            if not manifest:
                break
            manifest = manifest.replace('stremio://', 'https://', 1)
            url = urlsplit(manifest)
            if url.scheme not in ('http', 'https') or not url.hostname or url.username or url.password or url.query or url.fragment or not url.path.endswith('/manifest.json'):
                print('Adresse manifest.json HTTP(S) invalide.'); continue
            if manifest not in addons:
                addons.append(manifest)
    target.parent.mkdir(parents=True, exist_ok=True)
    # os.open applies restrictive permissions on first creation, before any token is written.
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as output:
        json.dump({'metadataManifest': 'https://v3-cinemeta.strem.io/manifest.json', 'addons': addons}, output, indent=2)
        output.write('\n')
    target.chmod(0o600)
    print('Configuration privée enregistrée. Aucun jeton n’a été affiché.')
    if args.android:
        remote = '/sdcard/Android/data/com.plezy.jellyfin/files'
        subprocess.run(['adb', 'shell', 'mkdir', '-p', remote], check=True)
        subprocess.run(['adb', 'push', str(target), remote + '/stremio.json'], check=True)
        subprocess.run(['adb', 'shell', 'am', 'force-stop', 'com.plezy.jellyfin'], check=True)
        print('Configuration copiée. Rouvrez Plezy sur le téléviseur.')


if __name__ == '__main__':
    main()
