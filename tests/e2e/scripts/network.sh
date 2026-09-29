#!/usr/bin/env bash
# Emulator network shaping. Usage: network.sh edge|umts|full
set -euo pipefail
case "$1" in
  edge) adb emu network speed edge; adb emu network delay edge ;;
  umts) adb emu network speed umts; adb emu network delay umts ;;
  full) adb emu network speed full; adb emu network delay none ;;
esac
