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
    Enhancement Shaman has air slot: Windfury (cat=Melee, w=5),
    Wrath of Air (cat=Caster, w=4), Grace of Air (cat=Melee+Ranged, w=2).
    All four players benefit from Melee, none from Caster.
      Windfury realised   = 5 * 4 = 20   ← best
      Grace of Air        = 2 * 4 =  8
      Wrath of Air        = 4 * 0 =  0
    Plus: Warriors provide Battle Shout (cat=Melee+Ranged, w=3, non-exclusive).
      Battle Shout realised = 3 * 4 = 12  (all four benefit from Melee)
      — two warriors both provide it, but it's deduplicated → counted once.
    Total = 20 + 12 = 32.
    """
    group = [
        p("s1", "Shaman", "Enhancement"),
        p("w1", "Warrior", "Fury"),
        p("w2", "Warrior", "Fury"),
        p("w3", "Warrior", "Fury"),
    ]
    assert score_group(group, SPECS, BUFFS) == 32.0


# ---------------------------------------------------------------------------
# Test 2 — exclusive air-slot selection: caster group chooses Wrath of Air
# ---------------------------------------------------------------------------
def test_air_slot_picks_wrath_of_air_for_caster_group():
    """
    Group: 1 Elemental Shaman + 3 Fire Mages.
    All four benefit from Caster; none from Melee or Ranged.
      Windfury realised   = 5 * 0 =  0
      Wrath of Air        = 4 * 4 = 16   ← best
      Grace of Air        = 2 * 0 =  0
    Elemental Shaman also has fire slot: Totem of Wrath (cat=Caster, w=5).
      Totem of Wrath realised = 5 * 4 = 20
    Mages provide Arcane Brilliance (cat=Mana, scope=raid) — raid scope, not scored.
    Total = 16 + 20 = 36.
    """
    group = [
        p("s1", "Shaman", "Elemental"),
        p("m1", "Mage", "Fire"),
        p("m2", "Mage", "Fire"),
        p("m3", "Mage", "Fire"),
    ]
    assert score_group(group, SPECS, BUFFS) == 36.0


# ---------------------------------------------------------------------------
# Test 3 — same buff from two providers is deduplicated
# ---------------------------------------------------------------------------
def test_duplicate_buff_counted_once():
    """
    Group: 2 Fury Warriors + 2 Arms Warriors.
    All four benefit from Melee (and Universal, but no Universal party buffs exist yet).
    Both specs provide Battle Shout (non-exclusive, cat=Melee+Ranged, w=3).
      Battle Shout realised = 3 * 4 = 12 — counted ONCE despite 4 providers.
    No other party buffs in this group.
    Total = 12.
    """
    group = [
        p("w1", "Warrior", "Fury"),
        p("w2", "Warrior", "Fury"),
        p("w3", "Warrior", "Arms"),
        p("w4", "Warrior", "Arms"),
    ]
    assert score_group(group, SPECS, BUFFS) == 12.0
