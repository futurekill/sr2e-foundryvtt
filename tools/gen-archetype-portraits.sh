#!/bin/zsh
# Token portraits for the Contacts pack's GM archetypes and Enemies, which the core book
# never illustrated (gen-contact-portraits.sh paints the illustrated ones from the book).
# Two finished portraits go in as STYLE references only. Output: _work/contacts/out/<slug>.webp;
# square them into assets/contact_portraits/ like the others (1024 webp).
# Usage: tools/gen-archetype-portraits.sh [batch-number ...]
set -u
ROOT=/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt
OUT=_work/contacts/out; WORK=${TMPDIR:-/tmp}/sr2e-archetypes; mkdir -p $WORK $ROOT/$OUT
cd $ROOT || exit 1
STYLE=(-i assets/contact_portraits/fixer.webp -i assets/contact_portraits/street-doc.webp)

typeset -A D
D[arms-dealer]="ork man in his fifties, heavy-set, reading glasses on a chain, cardigan over a shoulder holster, crates of rifles behind him. SETTING: a cramped back-room armoury, pegboard of firearms, a single green-shaded work lamp"
D[corp-contact]="human woman in her thirties, sharp grey corporate suit, discreet earpiece, company ID badge clipped at the waist, guarded smile. SETTING: a quiet corner of a corporate cafeteria at dawn, pale gold window light"
D[decker]="young elf woman with a datajack at her temple and a cable running to a cyberdeck on her lap, oversized hoodie, tired eyes lit by the screen. SETTING: a cluttered squat lit only by monitors and amber indicator lights"
D[docwagon-contact]="human paramedic man in a white-and-red armoured DocWagon trauma suit, helmet under one arm, medkit on his hip. SETTING: the open back of an armoured ambulance, white interior light, rain outside"
D[fence]="dwarf woman with braided grey hair and many rings, jeweller's loupe pushed up on her forehead, shrewd. SETTING: a pawnshop counter crowded with electronics, watches and chrome cyberlimbs, warm tungsten light"
D[gang-member]="teenage human ganger with a shaved head and gang tattoos on his neck, studded synthleather jacket, chain over the shoulder, defiant. SETTING: a basketball court under sodium streetlights, chain-link fence"
D[info-broker]="old human man, thin and bald, wire-rimmed spectacles, cardigan, stacks of optical chips and paper files around him. SETTING: a library-like den of shelves and filing cabinets, a brass desk lamp"
D[lone-star-contact]="off-duty Lone Star detective, human woman in a trench coat, badge on her belt, coffee cup in hand, weary but sharp. SETTING: a precinct squad room at night, desks and case boards, fluorescent light"
D[shadowrunner]="troll street samurai with cybereyes and a long armoured coat, assault rifle slung across his chest, calm. SETTING: a rooftop at sunrise, water towers and steam vents, orange dawn"
D[shaman]="human woman shaman with feathers and beads woven into her hair, a coyote-skull fetish on a cord, weathered face. SETTING: a lodge in a city park at twilight, a small fire and herbs drying"
D[tech-specialist]="human man with cyberarms, magnifier visor flipped down, soldering a drone's circuit board, safety apron. SETTING: a workshop with drones on shelves and a lit workbench, cool white LEDs"
D[corp-security-chief]="stern human woman in her fifties, close-cropped silver hair, dark security-corp uniform with rank pins, tablet showing a surveillance still. SETTING: a security operations room, walls of camera feeds, red alert lights"
D[gang-lieutenant]="ork woman with tusks and a buzzcut, gang colours and a scarred lip, brass knuckles, arms crossed. SETTING: the gang's clubhouse, a pool table, graffiti and a flickering neon beer sign"
D[jilted-fixer]="elf man in an expensive but rumpled suit, loosened tie, phone to his ear, cold disappointed look. SETTING: a rain-streaked penthouse window at night, city lights blurred far below"
D[rival-shadowrunner]="human woman runner with a cyberarm and a katana over her shoulder, armoured jacket, smirking. SETTING: a misty dockyard at night, cargo containers and harbour lights"
D[vengeful-ex-employer]="human man in his sixties in a perfect pinstripe suit, cufflinks, steepled fingers, silver hair, quiet fury. SETTING: a dark boardroom with a long table and a single overhead light"

BATCHES=(
  "arms-dealer corp-contact decker docwagon-contact fence gang-member"
  "info-broker lone-star-contact shadowrunner shaman tech-specialist"
  "corp-security-chief gang-lieutenant jilted-fixer rival-shadowrunner vengeful-ex-employer"
)

for b in ${@:-1 2 3}; do
  slugs=(${=BATCHES[$b]}); pf=$WORK/batch-$b.txt
  cat > $pf <<EOF
Use your imagegen skill with the built-in image_gen tool (NOT the CLI fallback).

Generate ${#slugs} character portraits for a Shadowrun (2050s cyberpunk) tabletop game,
one image per character. The two attached images are finished portraits from the same
set: match their PAINTING STYLE, framing and finish only. Do NOT copy their people.

STYLE for every image: square 1:1, head-and-shoulders to waist, character centred and
facing the viewer, dramatic lighting that comes from their OWN setting, that setting
soft-focus behind them, painterly realism. Each character's setting and palette must
differ, and NOT a neon city skyline, and NOT mostly purple. NO text, NO logos, NO
watermarks, NO frame or border.

EOF
  i=1
  for s in $slugs; do echo "$i. $D[$s]. Save to $OUT/$s.webp" >> $pf; i=$((i+1)); done
  echo "\nReport every saved path." >> $pf
  echo "=== batch $b ($(date +%H:%M:%S))"
  timeout 2400 codex exec --skip-git-repo-check -s workspace-write $STYLE < $pf > $WORK/batch-$b.log 2>&1
  for s in $slugs; do [ -f "$OUT/$s.webp" ] && echo "   OK   $s" || echo "   MISS $s"; done
  grep -q 'usage limit\|"type":"error"' $WORK/batch-$b.log && echo "   !! codex error — $WORK/batch-$b.log"; true
done
