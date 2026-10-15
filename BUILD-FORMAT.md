# Character build format

A **build** is the character itself: stats, attacks, spells, features, starting gear. The sheet reads it and does the math (ability modifiers, saves, skills, passive Perception, proficiency bonus). Everything that changes during play (HP, spent slots, items, notes) is tracked separately, so you can replace the build when a character levels up without losing the current state.

Players paste a build when creating a character (Party page) or later from the sheet's **Gear & notes → Character build** panel.

Working examples: [`assets/examples/sample-fighter.json`](assets/examples/sample-fighter.json).

## Top level

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | Character name |
| `tagline` | | Small line above the name, e.g. `"Half-elf · Sage · Level 3"` |
| `classLine` | | Line under the name, e.g. `"Wizard 3 (Evocation)"` |
| `level` | | Total level. Sets proficiency bonus unless `prof` is given |
| `prof` | | Override proficiency bonus |
| `maxHp`, `ac`, `speed` | | Numbers. Speed in feet |
| `initiative` | | Override (defaults to DEX modifier) |
| `abilities` | | `{"STR":10,"DEX":14,"CON":12,"INT":16,"WIS":10,"CHA":8}` |
| `saveProf` | | `["INT","WIS"]` |
| `saveBonus` | | Extra flat bonus per save, e.g. `{"WIS":1}` |
| `skillProf` | | `["Arcana","History"]` (official skill names) |
| `skillExpertise` | | Skills with double proficiency |
| `skillBonus` | | Extra flat bonus per skill, e.g. `{"Perception":1}` |
| `skillNote` | | Hint shown on the skills panel |
| `critMin` | | Lowest natural roll that crits (19 for a Champion) |
| `acToggles` | | Buttons that raise AC, e.g. Shield: `[{"id":"shield","label":"Shield +5","bonus":5}]` |
| `slots` | | Spell slot pools (see below) |
| `hitDice` | | `[{"die":10,"count":3,"label":"Fighter"}]`. Adds CON mod unless `"mod"` is set |
| `riders` | | Toggles that add damage (see below) |
| `attacks` | | Attack cards (see below) |
| `resources` | | Class features with uses (see below) |
| `spells` | | Spell lists (see below). Leave out for non-casters and the Spells tab disappears |
| `traits` | | List of strings for the Traits & features panel |
| `backstory` | | Text. Shown on the Character tab |
| `inventory` | | Starting items (see below) |
| `coins` | | `{"pp":0,"gp":15,"sp":0,"cp":0}` |

Text fields allow `**bold**` and `*italic*`.

## Dice

Anywhere damage or a roll is expected, write a string such as `"1d8 slashing + 3"`, `"2d6 fire"`, `"1d10 + 4"`, or `"3 (curse)"` for a flat bonus with a label. Each `+` piece is rolled separately and labeled.

## Slots

```json
"slots": [
  {"id": "s1", "label": "1st level", "count": 4, "reset": "long"},
  {"id": "s2", "label": "2nd level", "count": 2, "reset": "long", "gold": true}
]
```

`reset` is `"short"` or `"long"`. `gold` draws gold pips instead of purple.

## Attacks

```json
{"name": "Longbow", "tags": [["Action", "act"]], "summary": "+5 · 1d8+3 piercing · 150/600 ft",
 "buttons": [
   {"label": "Shoot", "attack": 5, "consume": "Arrows", "primary": true},
   {"label": "Damage", "damage": "1d8 piercing + 3"}
 ]}
```

Tag kinds: `act` (action), `bonus` (bonus action), `free`.

Button fields:

- `attack`: attack bonus. Rolls a d20 using the Normal/Advantage/Disadvantage bar.
- `times`: roll the attack several times (Eldritch Blast beams, Extra Attack).
- `damage`: damage dice. Doubled automatically on a crit.
- `consume`: inventory item name to use up one of (arrows, javelins).
- `spend`: a slot or resource id to spend (e.g. Divine Smite spending a slot).
- `kind`: which riders apply. Default `"hit"`. Use e.g. `"smite"` for damage that only some riders boost.
- `riders: false`: no riders on this button. `nocrit: true`: never doubles.
- `log`: text added to the roll log.

## Riders

Toggles above the attacks that add damage while switched on:

```json
"riders": [
  {"id": "hex", "label": "Hex", "damage": "1d6 necrotic"},
  {"id": "undead", "label": "Undead/fiend", "kind": "smite", "damage": "1d8 radiant"},
  {"id": "curse", "label": "Target cursed", "damage": "3 (curse)", "critMin": 19}
]
```

## Resources

```json
"resources": [
  {"id": "rage", "name": "Rage", "tag": ["Bonus action", "bonus"], "max": 3, "reset": "long", "note": "+2 damage, resistance to physical damage."},
  {"id": "secondwind", "name": "Second Wind", "max": 1, "reset": "short", "actions": [{"label": "Use", "roll": "1d10 + 3", "healSelf": true}]},
  {"id": "loh", "name": "Lay on Hands", "type": "pool", "max": 15, "reset": "long", "healSelf": true},
  {"id": "wings", "name": "Heavenly Wings", "type": "toggle", "max": 1, "reset": "long", "activeNote": "fly 30 ft", "activeDamage": "3 radiant"}
]
```

- Default type: a row of pips, tap to spend. `actions` add buttons that spend one use and roll or log something. `activates` (a rider id) switches that rider on when used.
- `"type": "pool"`: a number with +/−, like Lay on Hands. `healSelf` adds a button that heals using the HP Amount box.
- `"type": "toggle"`: an on/off effect. While on, `activeDamage` is added to hits and `activeNote` shows under Speed. Ends on any rest.

## Spells

```json
"spells": {
  "header": "DC 13 · +5 · tap a name for details",
  "groups": [
    {"name": "Cantrips", "cantrip": true, "spells": [
      {"n": "Fire Bolt", "lvl": "Cantrip", "t": "Action · 120 ft", "d": "Ranged spell attack, 1d10 fire.",
       "actions": [{"label": "Attack", "attack": 5}, {"label": "Damage", "roll": "1d10 fire"}]}
    ]},
    {"name": "Known spells", "spells": [
      {"n": "Shield", "lvl": "1st", "t": "Reaction", "d": "+5 AC until your next turn.", "actions": [{"label": "Cast", "acToggle": "shield", "spend": "s1"}]}
    ]}
  ],
  "prepared": {"name": "Spellbook", "groupLabel": "Prepared", "max": 6, "default": ["Magic Missile"],
    "spells": [{"n": "Magic Missile", "lvl": "1st", "t": "Action · 120 ft", "d": "Three darts, 1d4+1 force each."}]}
}
```

Spell fields: `n` name, `lvl` level label, `t` casting time and range, `d` description, `c: true` for concentration (adds a *Start concentrating* button), `up` upcast note, `uses` which slots it can use.

Spell action fields: `label`, `roll`, `attack`, `healSelf`, `tempHp`, `acToggle`, `spend`, `log`.

`prepared` is optional. Use it for classes that choose spells after a long rest (cleric, druid, paladin, wizard).

## Inventory

```json
"inventory": [
  {"n": "Longsword", "q": 1, "eq": 1},
  {"n": "Arrows", "q": 20},
  {"n": "Potion of healing", "q": 2, "potion": "2d4 + 2", "d": "Action to drink: regain 2d4 + 2 HP."}
]
```

`eq: 1` marks equipped. `potion` adds a *Drink* button that rolls and heals. `d` is the description.
