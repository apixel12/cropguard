#!/bin/zsh
# Re-create the unzipped dataset folders from the kept archives (clean_data.sh moves the
# unzipped copies to the Trash). Run this before training or evaluating.
set -e
cd "${0:A:h}/.."
x() { [ -f "$1" ] || { echo "missing archive $1"; return; }; mkdir -p "$2" && bsdtar -xf "$1" -C "$2" && echo "extracted $1"; }
for a in cassava cotton cotton_sarcld rice_riceleafbd; do x data/farm_raw/$a.zip data/farm_raw/$a; done
x data/farm_raw/rice_sethy.7z data/farm_raw/rice_sethy
x data/farm_raw/sugarcane.rar data/farm_raw/sugarcane
x data/farm_raw/wheat_holeta.rar data/farm_raw/wheat_holeta
x data/plantdoc.zip data/plantdoc_raw
