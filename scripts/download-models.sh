#!/bin/sh
# Downloads every model in models.txt into the Docker volumes. Idempotent and resumable:
# files with the right size are skipped, partial downloads continue where they stopped.
set -eu
MANIFEST=/scripts/models.txt
failed=0

size_of() { [ -f "$1" ] && stat -c %s "$1" || echo 0; }

while IFS='|' read -r dest size url; do
  case "$dest" in ''|\#*) continue ;; esac
  file="/models/$dest"
  mb=$((size / 1048576))
  if [ "$(size_of "$file")" = "$size" ]; then
    echo "OK        $dest"
    continue
  fi
  mkdir -p "$(dirname "$file")"
  # A wrong-sized final file is an interrupted download: resume it.
  [ -f "$file" ] && mv "$file" "$file.part"
  echo "Bajando   $dest (${mb} MB)"
  if curl -fL --retry 5 --retry-delay 10 --retry-all-errors -C - -# -o "$file.part" "$url"; then
    if [ "$(size_of "$file.part")" = "$size" ]; then
      mv "$file.part" "$file"
      echo "OK        $dest"
      continue
    fi
    echo "ERROR     $dest: tamaño inesperado ($(size_of "$file.part") de $size bytes)"
  else
    echo "ERROR     $dest: falló la descarga (se puede reintentar, continúa donde quedó)"
  fi
  failed=$((failed + 1))
done < "$MANIFEST"

if [ "$failed" -gt 0 ]; then
  echo "$failed archivo(s) no se descargaron. Vuelve a correr el setup para reintentar."
  exit 1
fi
echo "Todos los modelos están listos."
