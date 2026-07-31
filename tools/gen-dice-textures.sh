#!/bin/zsh
# Generate Dice So Nice material textures via the Codex imagegen skill.
# Resumable (skips textures that already exist). Run from the system root:
#   zsh tools/gen-dice-textures.sh
#
# These are MATERIALS, not pictures of dice. DSN wraps the image onto the die
# body and draws the numerals itself from the colorset's `foreground`, so any
# number, die shape or object in the texture is a defect. Built-in DSN textures
# are 256x256 (see modules/dice-so-nice/textures/standard.json); we generate at
# 1024 and downscale, which keeps detail crisp and lets the model work at a size
# it is good at.
#
# Bump maps are DERIVED from each source by tools/make-dice-bumps.sh rather than
# generated separately — a separately generated bump would not line up with its
# own colour map, which is the whole point of a bump map.
set -u
SYS=/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt
TSV=$SYS/tools/dice-texture-prompts.tsv
OUT=$SYS/assets/dice_textures
WORK=${TMPDIR:-/tmp}/sr2e-dice-tex
mkdir -p $WORK $OUT
cd $SYS || exit 1

PREAMBLE='Use your imagegen skill with the built-in image_gen tool (NOT the CLI fallback). Generate SEAMLESS TILING MATERIAL TEXTURES for 3D dice. Perfect SQUARE 1:1, 1024x1024.

CRITICAL CONSTRAINTS — these are textures, not illustrations:
- NO dice, NO numbers, NO digits, NO pips, NO symbols, NO logos, NO text of any kind.
- NO objects, NO characters, NO scenery, NO horizon, NO vignette, NO borders or frames.
- FLAT, EVEN, ambient lighting across the whole square. No directional key light, no cast shadows, no hotspot, no glare. The 3D engine supplies its own lighting; baked-in lighting makes the die look wrong.
- FILL the entire square edge to edge with the material. The pattern should tile without an obvious seam.
- BOLD, LARGE-SCALE features with strong value contrast. This gets shrunk to 256x256 and wrapped on a die face barely a centimetre across — fine filigree turns to mush. Think a handful of big confident shapes, not a hundred tiny ones.
- It should read as a flat sample of a MATERIAL, photographed straight on.

Gritty Shadowrun cyberpunk-fantasy mood. Generate a SEPARATE new square image for EACH texture and SAVE it as webp to the EXACT path given. If a path already exists, SKIP it. Report each saved path.'

TODO=$WORK/todo.tsv; : > $TODO
while IFS=$'\t' read -r rel body; do
  [ -f "$OUT/$rel" ] || print -r -- "$rel\t$body" >> $TODO
done < $TSV
echo "TODO textures: $(wc -l < $TODO | tr -d ' ')  $(date +%H:%M:%S)"
[ -s $TODO ] || { echo "nothing to do"; exit 0; }

CHUNK=3
lines=("${(@f)$(cat $TODO)}")
i=1; c=1
while (( i <= ${#lines[@]} )); do
  block=""; n=0
  while (( n < CHUNK && i <= ${#lines[@]} )); do
    line="${lines[$i]}"; rel="${line%%$'\t'*}"; desc="${line#*$'\t'}"
    block="$block
- Save to assets/dice_textures/$rel — $desc"
    i=$((i+1)); n=$((n+1))
  done
  print -r -- "$PREAMBLE$block" > $WORK/chunk_$c.txt
  echo "=== CHUNK $c ($n) $(date +%H:%M:%S) ==="
  timeout 900 codex exec --skip-git-repo-check -s workspace-write \
    < $WORK/chunk_$c.txt >> $WORK/chunk_$c.log 2>&1
  echo "   chunk $c exit: $? $(date +%H:%M:%S)"
  # A quota-blocked batch exits 0 having written NOTHING, so say so loudly.
  grep -qi "usage limit\|quota\|rate limit" $WORK/chunk_$c.log \
    && echo "   !! QUOTA MESSAGE in chunk $c — see $WORK/chunk_$c.log"
  c=$((c+1))
done

echo "=== DONE. Missing: ==="
while IFS=$'\t' read -r rel body; do [ -f "$OUT/$rel" ] || echo "MISS $rel"; done < $TSV
