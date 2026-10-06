#!/usr/bin/env bash
# Build a standalone program in dist/RajshahiTours (Linux or macOS).
set -euo pipefail
cd "$(dirname "$0")"

python3 -m pip install --upgrade pip
python3 -m pip install -r requirements.txt pyinstaller

rm -rf build dist
python3 -m PyInstaller rajshahi_tours.spec --noconfirm --clean

echo
echo "Done: $(pwd)/dist/RajshahiTours/RajshahiTours"
