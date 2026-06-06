import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.data_loader import Player, load_buffs, load_specs
from app.optimizer import optimize
from app.scorer import score_group

SPECS = load_specs()
BUFFS = load_buffs()

# 25-player sample roster (spec names match specs_benefits.csv exactly)
ROSTER_25 = [
    Player("p01", "Druid",   "Feral (Bear)"),
    Player("p02", "Warrior", "Protection"),
    Player("p03", "Warrior", "Fury"),
    Player("p04", "Warrior", "Fury"),
    Player("p05", "Rogue",   "Any"),
    Player("p06", "Rogue",   "Any"),
    Player("p07", "Hunter",  "Beast Mastery"),
    Player("p08", "Hunter",  "Beast Mastery"),
    Player("p09", "Shaman",  "Enhancement"),
    Player("p10", "Shaman",  "Restoration"),
    Player("p11", "Shaman",  "Restoration"),
    Player("p12", "Shaman",  "Elemental"),
    Player("p13", "Paladin", "Retribution"),
    Player("p14", "Paladin", "Retribution"),
    Player("p15", "Paladin", "Holy"),
    Player("p16", "Warlock", "Affliction"),
    Player("p17", "Warlock", "Demonology"),
    Player("p18", "Warlock", "Demonology"),
    Player("p19", "Mage",    "Arcane"),
    Player("p20", "Mage",    "Arcane"),
    Player("p21", "Mage",    "Arcane"),
    Player("p22", "Priest",  "Shadow"),
    Player("p23", "Priest",  "Holy"),
    Player("p24", "Priest",  "Holy"),
    Player("p25", "Druid",   "Balance"),
]


def test_25man_invariants():
    groups, total = optimize(ROSTER_25, kt_sets=[], raid_size=25,
                             specs_lookup=SPECS, buffs=BUFFS)

    # Structural checks
    assert len(groups) == 5, "Expected 5 groups for 25-man"
    for g in groups:
        assert len(g) <= 5, f"Group exceeds capacity: {g}"

    all_placed = [p for g in groups for p in g]
    assert len(all_placed) == 25, "Not all 25 players were placed"
    placed_ids = {p.id for p in all_placed}
    assert placed_ids == {p.id for p in ROSTER_25}, "Player IDs mismatch after optimisation"

    assert total > 0, "Total score should be positive"
    print(f"\nTotal score: {total}")


def test_25man_output(capsys):
    """Print the resulting groups for manual inspection."""
    groups, total = optimize(ROSTER_25, kt_sets=[], raid_size=25,
                             specs_lookup=SPECS, buffs=BUFFS)

    lines = [f"\n{'='*50}", f"  25-man optimisation  —  total score: {total:.1f}", f"{'='*50}"]
    for idx, group in enumerate(groups, 1):
        gscore = score_group(group, SPECS, BUFFS)
        lines.append(f"\nGroup {idx}  (score: {gscore:.1f})")
        for player in group:
            lines.append(f"  {player.class_name} / {player.spec}")
    print("\n".join(lines))


def test_keep_together_respected():
    """Players in a KT set must end up in the same group."""
    # Keep the two Fury Warriors together
    kt = [["p03", "p04"]]
    groups, _ = optimize(ROSTER_25, kt_sets=kt, raid_size=25,
                         specs_lookup=SPECS, buffs=BUFFS)
    for group in groups:
        ids = {p.id for p in group}
        if "p03" in ids:
            assert "p04" in ids, "Fury Warriors were split despite keep-together"
            break
