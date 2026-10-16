#!/bin/zsh
# Item icons from a list: tools/gen-item-icons.sh <list.tsv> [batch ...]
# Each line: <asset path><TAB><what the item looks like>. Generated at full size into
# _work/icons/, then resized to 256x256 WebP at the asset path (item icon spec).
# Run from the package root (the system or a module). Two existing icons are style refs.
set -u
LIST=$1; shift
ROOT=$PWD; GEN=_work/icons; WORK=${TMPDIR:-/tmp}/sr2e-icons-${ROOT:t}; mkdir -p $WORK $GEN
REFS=(); for r in $(ls assets/item_icons/*/*.webp 2>/dev/null | head -2); do REFS+=(-i $r); done
PATHS=(${(f)"$(cut -f1 $LIST)"})
typeset -A P; while IFS=$'\t' read -r k d; do P[$k]=$d; done < $LIST
NB=$(( (${#PATHS} + 7) / 8 ))
for b in ${@:-$(seq 1 $NB)}; do
  keys=(${PATHS[$(( (b-1)*8 + 1 )),$(( b*8 ))]}); pf=$WORK/batch-$b.txt; list=""
  for k in $keys; do list+="- ${P[$k]}. Save to $GEN/${k:t}"$'\n'; done
  cat > $pf <<EOT
Use your imagegen skill with the built-in image_gen tool (NOT the CLI fallback).

Generate ${#keys} inventory icons for a Shadowrun (2050s cyberpunk) tabletop game, one
image per item. The attached images are existing icons from the same set: match their
style and finish, not their subjects. STYLE for every icon: square 1:1, a single subject
centred and filling most of the frame, three-quarter view, photoreal-painterly, dark
charcoal background with a soft vignette, moody rim lighting with small coloured glow
accents. Vary the colours by subject, NOT mostly purple. NO text, NO logos, NO
watermarks, NO border, NO hands or people.

$list
Report every saved path.
EOT
  echo "=== batch $b ($(date +%H:%M:%S))"
  timeout 2400 codex exec --skip-git-repo-check -s workspace-write $REFS < $pf > $WORK/batch-$b.log 2>&1
  for k in $keys; do
    src=$GEN/${k:t}
    if [ -f $src ]; then mkdir -p ${k:h}; magick $src -resize 256x256^ -gravity center -extent 256x256 -strip -quality 82 -define webp:method=6 $k && echo "   OK   $k"
    else echo "   MISS $k"; fi
  done
  grep -q 'usage limit\|"type":"error"' $WORK/batch-$b.log && echo "   !! codex error — $WORK/batch-$b.log"; true
done
