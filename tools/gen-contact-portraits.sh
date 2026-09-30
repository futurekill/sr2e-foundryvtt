#!/bin/zsh
# Token portraits for the SR2E Contacts (NPCs) pack, based on the core book's
# contact illustrations (SR2 p.203-213). References are crops of those pages in
# _work/contacts/ref/<slug>.png (git-ignored). Output: _work/contacts/out/<slug>.webp,
# then tools/fit-contact-portraits.mjs squares them into assets/contact_portraits/.
# Usage: tools/gen-contact-portraits.sh [batch-number ...]
set -u
ROOT=/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt
REF=$ROOT/_work/contacts/ref; OUT=_work/contacts/out
WORK=${TMPDIR:-/tmp}/sr2e-contacts; mkdir -p $WORK $ROOT/$OUT
cd $ROOT || exit 1

typeset -A D
D[bartender]="grizzled old human man behind a bar, big nose, deep lines, cigarette in his mouth, polishing a glass"
D[bounty-hunter]="hard-bitten human woman, wide-brimmed hat with goggles on the brim, bandolier over a battered coat, a badge on her chest, cool appraising stare"
D[city-official]="human man in a dark suit and fedora, sunglasses, trim goatee, poker face"
D[company-man]="human man in an immaculate suit with a pocket square, slicked hair, tinted glasses, quietly dangerous"
D[corporate-secretary]="young human woman, pale hair falling across her eyes, composed and discreet, corporate office"
D[corporate-security-guard]="corporate security guard in full armour and a visored helmet, unit number 812 on the chest plate"
D[dwarf-technician]="dwarf man with a headset, heavy beard, tool belts and pouches, carrying a toolbox"
D[elven-hitman]="elf man, gaunt and elegant, long straight black hair, pointed ears, immaculate high collar, cold eyes"
D[fixer]="woman with long straight dark hair, narrow sunglasses, high-collared coat, knowing half-smile"
D[gang-boss]="human man with wild curly hair, stubble, battered leather jacket with pins, tough"
D[humanis-policlub-member]="sinister figure in a tall pointed hood that hides the face, only shadow where the eyes should be"
D[mechanic]="human woman with long wavy hair, work goggles pushed up on her head, grease-stained work vest"
D[media-producer]="human woman with long dark hair and a patterned bandana, pendant necklace, sharp eye for a story"
D[metahuman-rights-activist]="human man with short hair and round goggles, casual jacket, arms folded, determined"
D[mr-johnson]="human man in a sharp suit, slicked-back dark hair, heavy-lidded cold eyes, faint smile"
D[squatter]="rugged unshaven human man in hooded rags and layers, wary, hard life"
D[street-cop]="armoured Lone Star street cop, helmet and visor, badge number 4517, one hand raised to stop you, pistol in the other"
D[street-doc]="grinning human man in a helmet with jeweller's magnifying goggles, a little unhinged"
D[talismonger]="woman in a wide hat and round sunglasses, long coat hung with charms, fetishes and talismans"
D[tribal-chief]="Amerindian man with a tall ornate ceremonial headdress, beard, eagle feather, dignified"
D[troll-bouncer]="huge troll with tusks and horns in a suit, pointing at you, no-nonsense"
D[yakuza-boss]="Japanese man with slicked hair and a thin moustache, dark silk jacket, composed and menacing"

# A backdrop per contact, so the set doesn't read as one skyline repeated.
typeset -A BG
BG[bartender]="behind his own dim, smoky dive bar: bottles on backlit shelves, a buzzing beer sign"
BG[bounty-hunter]="a rain-soaked highway truck stop at dusk, her bike's headlight behind her"
BG[city-official]="a wood-panelled city-hall office with blinds, flags and a framed seal, grey daylight"
BG[company-man]="a sterile corporate executive corridor of glass and brushed steel, cold white light"
BG[corporate-secretary]="a sleek corporate reception desk with holographic displays, soft blue office light"
BG[corporate-security-guard]="a corporate checkpoint gate at night, floodlights and a barrier arm"
BG[dwarf-technician]="a cluttered electronics workbench, soldering smoke, circuit boards and a hanging lamp"
BG[elven-hitman]="an elegant rooftop terrace at night, a sniper's view over distant lights, cold moonlight"
BG[fixer]="the back booth of an upscale nightclub, velvet and low amber light"
BG[gang-boss]="a graffiti-covered underpass with burning barrels and motorcycles"
BG[humanis-policlub-member]="a torch-lit night rally, blurred crowd and banners behind him"
BG[mechanic]="a garage bay with a car on a lift, tools on a pegboard, warm work lights"
BG[media-producer]="a trideo studio control room, walls of monitors and a live on-air light"
BG[metahuman-rights-activist]="a daytime street protest, blurred placards and a crowd of mixed metatypes"
BG[mr-johnson]="the private corner of an exclusive restaurant, candlelight and white linen"
BG[squatter]="a derelict condemned tenement room, broken windows, a trash-can fire"
BG[street-cop]="a grimy street corner at night, the red and blue lights of a patrol car"
BG[street-doc]="a back-alley clinic, surgical lamp, mismatched medical gear and tiled walls"
BG[talismonger]="a cramped talisman shop, shelves of herbs, skulls, crystals and candles"
BG[tribal-chief]="a council lodge with carved posts and a firelit hearth, forest dusk beyond"
BG[troll-bouncer]="the velvet-rope door of a loud nightclub, a queue and pink door lights"
BG[yakuza-boss]="a traditional Japanese tea room with shoji screens, a koi painting and lantern light"

BATCHES=(
  "bartender bounty-hunter city-official company-man corporate-secretary corporate-security-guard"
  "dwarf-technician elven-hitman fixer gang-boss humanis-policlub-member mechanic"
  "media-producer metahuman-rights-activist mr-johnson squatter street-cop"
  "street-doc talismonger tribal-chief troll-bouncer yakuza-boss"
)

# restage <slug...>: keep an existing portrait's character, replace only the backdrop.
if [ "${1:-}" = restage ]; then
  shift; slugs=($@); pf=$WORK/restage.txt; refs=()
  cat > $pf <<EOF
Use your imagegen skill with the built-in image_gen tool (NOT the CLI fallback).

Each reference image is a finished character portrait, attached in the SAME ORDER
as the list below. For each one, produce a new version that keeps the character
EXACTLY as they are — face, hair, clothing, pose, framing, painterly style — and
replaces ONLY the background with the setting given, lit to match. Square 1:1.
NO text, NO logos, NO watermarks, NO frame or border.

EOF
  i=1
  for s in $slugs; do echo "$i. SETTING: $BG[$s]. Save to $OUT/restaged/$s.webp" >> $pf; refs+=(-i "$OUT/$s.webp"); i=$((i+1)); done
  echo "\nReport every saved path." >> $pf; mkdir -p $OUT/restaged
  timeout 2400 codex exec --skip-git-repo-check -s workspace-write $refs < $pf > $WORK/restage-$1.log 2>&1
  for s in $slugs; do [ -f "$OUT/restaged/$s.webp" ] && echo "   OK   $s" || echo "   MISS $s"; done
  exit 0
fi

for b in ${@:-1 2 3 4}; do
  slugs=(${=BATCHES[$b]}); pf=$WORK/batch-$b.txt; refs=()
  cat > $pf <<EOF
Use your imagegen skill with the built-in image_gen tool (NOT the CLI fallback).

Generate ${#slugs} character portraits for a Shadowrun (2050s cyberpunk) tabletop game,
one image per character. The reference images are black-and-white illustrations
of these same characters, attached in the SAME ORDER as the list below: keep each
character's likeness, face, build, clothing and signature props from their
reference, but render them as a fully painted, cinematic, full-colour portrait.

STYLE for every image: square 1:1, head-and-shoulders to waist, character centred
and facing the viewer, dramatic lighting that comes from their OWN setting (given
per character below), that setting soft-focus behind them, painterly realism.
Each character's setting and palette must differ — NOT a neon city skyline. NO text, NO
logos, NO watermarks, NO frame or border.

EOF
  i=1
  for s in $slugs; do
    echo "$i. $D[$s]. SETTING: $BG[$s]. Save to $OUT/$s.webp" >> $pf; refs+=(-i "$REF/$s.png"); i=$((i+1))
  done
  echo "\nReport every saved path." >> $pf
  echo "=== batch $b ($(date +%H:%M:%S))"
  timeout 2400 codex exec --skip-git-repo-check -s workspace-write $refs < $pf > $WORK/batch-$b.log 2>&1
  for s in $slugs; do [ -f "$OUT/$s.webp" ] && echo "   OK   $s" || echo "   MISS $s"; done
  grep -q 'usage limit\|"type":"error"' $WORK/batch-$b.log && echo "   !! codex error — $WORK/batch-$b.log"; true
done
