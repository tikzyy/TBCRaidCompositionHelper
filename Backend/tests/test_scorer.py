"""
Scorer unit tests against hand-computed expected values.

All expected scores are derived manually from provided_buffs.csv weights and the
scoring formula:  realised(buff) = buff.weight * len([p for p in group if p benefits])
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.data_loader import Player, load_buffs, load_specs
from app.scorer import score_group

SPECS = load_specs()
BUFFS = load_buffs()


def p(id_, class_, spec):
    return Player(id=id_, class_name=class_, spec=spec)


# ---------------------------------------------------------------------------
# Test 1 — exclusive air-slot selection: melee group chooses Windfury
# ---------------------------------------------------------------------------
def test_air_slot_picks_windfury_for_melee_group():
    """
    Group: 1 Enhancement Shaman + 3 Fury Warriors.
    Enhancement Shaman has air slot (all Shamans): Windfury (MeleeSwing w=5),
    Wrath of Air (Caster w=4), Grace of Air (Melee+Ranged w=3).
    Enhancement also has air_twist slot: Grace (Melee+Ranged w=3) or Wrath (Caster w=4).
    All four benefit from MeleeSwing/Melee (weight 1.0 each); none from Caster.
      air slot   -> Windfury  5*4 = 20  (best)
      air_twist  -> Grace     3*4 = 12  (best secondary for this melee group)
      Wrath of Air = 4*0 = 0 in both slots
    Warriors provide Battle Shout (Melee+Ranged w=2), deduplicated to one instance.
      Battle Shout = 2*4 = 8
    Total = 20 + 12 + 8 = 40.
    """
    group = [
        p("s1", "Shaman", "Enhancement"),
        p("w1", "Warrior", "Fury"),
        p("w2", "Warrior", "Fury"),
        p("w3", "Warrior", "Fury"),
    ]
    assert score_group(group, SPECS, BUFFS) == 40.0


# ---------------------------------------------------------------------------
# Test 2 — exclusive air-slot selection: caster group chooses Wrath of Air
# ---------------------------------------------------------------------------
def test_air_slot_picks_wrath_of_air_for_caster_group():
    """
    Group: 1 Elemental Shaman + 3 Fire Mages.
    Fire Mage has Caster:0.9; Elemental Shaman has Caster:1.0.
    Caster sum = 1.0 + 0.9*3 = 3.7; no Melee/MeleeSwing benefit.
      Windfury realised      = 5 * 0    =  0
      Wrath of Air           = 4 * 3.7  = 14.8  ← best air slot
      Grace of Air           = 3 * 0    =  0
    Elemental Shaman also has fire slot: Totem of Wrath (cat=Caster, w=5).
      Totem of Wrath realised = 5 * 3.7 = 18.5
    Mages provide Arcane Brilliance (cat=Mana, scope=raid) — raid scope, not scored.
    Total = 14.8 + 18.5 = 33.3.
    """
    group = [
        p("s1", "Shaman", "Elemental"),
        p("m1", "Mage", "Fire"),
        p("m2", "Mage", "Fire"),
        p("m3", "Mage", "Fire"),
    ]
    assert score_group(group, SPECS, BUFFS) == 33.3


# ---------------------------------------------------------------------------
# Test 3 — same buff from two providers is deduplicated
# ---------------------------------------------------------------------------
def test_duplicate_buff_counted_once():
    """
    Group: 2 Fury Warriors + 2 Arms Warriors.
    Fury has Melee:1.0; Arms has Melee:0.9 (slightly weaker per CSV).
    Both specs provide Battle Shout (shout slot, cat=Melee+Ranged, w=2, stack_decay=0).
      Melee sum = 1.0 + 1.0 + 0.9 + 0.9 = 3.8
      Battle Shout realised = 2 * 3.8 = 7.6 — counted ONCE despite 4 providers.
    No other party buffs in this group.
    Total = 7.6.
    """
    group = [
        p("w1", "Warrior", "Fury"),
        p("w2", "Warrior", "Fury"),
        p("w3", "Warrior", "Arms"),
        p("w4", "Warrior", "Arms"),
    ]
    assert score_group(group, SPECS, BUFFS) == 7.6
