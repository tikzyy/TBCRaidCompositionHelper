"""
Scorer unit tests against hand-computed expected values.

Scoring formula:
  realised(buff, group) = buff.weight * sum(
      max(player_benefit_weight for each of buff's categories the player has)
      for each player in group
  )
"""
import sys
from pathlib import Path

import pytest

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

    Enhancement Shaman air slot candidates (all Shaman Any rows):
      Windfury      (MeleeSwing, w=5)  → 5 * (1.0+1.0+1.0+1.0) = 20.0  ← best
      Wrath of Air  (SpellPower, w=4)  → 4 * 0                  =  0.0
      Grace of Air  (Agility,    w=3)  → 3 * (0.6+0.5+0.5+0.5)  =  6.3

    Enhancement air_twist slot (Enhancement-specific rows):
      Grace of Air  (Agility,    w=3)  → 3 * (0.6+0.5+0.5+0.5)  =  6.3  ← best
      Wrath of Air  (SpellPower, w=4)  → 4 * 0                  =  0.0

    Enhancement earth slot:
      Strength of Earth (Strength, w=3) → 3 * (1.0+1.0+1.0+1.0) = 12.0

    Warriors provide Battle Shout (AttackPower, shout, w=2, stack_decay=0),
    deduplicated to one instance:
      Battle Shout → 2 * (1.0+1.0+1.0+1.0) = 8.0

    Total = 20.0 + 6.3 + 12.0 + 8.0 = 46.3
    """
    group = [
        p("s1", "Shaman", "Enhancement"),
        p("w1", "Warrior", "Fury"),
        p("w2", "Warrior", "Fury"),
        p("w3", "Warrior", "Fury"),
    ]
    assert score_group(group, SPECS, BUFFS) == pytest.approx(46.3, abs=1e-6)


# ---------------------------------------------------------------------------
# Test 2 — exclusive air-slot selection: caster group chooses Wrath of Air
# ---------------------------------------------------------------------------
def test_air_slot_picks_wrath_of_air_for_caster_group():
    """
    Group: 1 Elemental Shaman + 3 Fire Mages.

    All four have SpellPower=1.0 and SpellCrit=1.0; none benefit from
    MeleeSwing, Strength, or Agility.

    Elemental Shaman air slot candidates (all Shaman Any rows):
      Wrath of Air  (SpellPower, w=4) → 4 * (1.0+1.0+1.0+1.0) = 16.0  ← best
      Windfury      (MeleeSwing, w=5) → 5 * 0                  =  0.0
      Grace of Air  (Agility,    w=3) → 3 * 0                  =  0.0

    Elemental Shaman fire slot:
      Totem of Wrath (SpellCrit+SpellHit, w=5)
        each player: max(SpellCrit=1.0, SpellHit=0.9 or 1.0) = 1.0
        → 5 * (1.0+1.0+1.0+1.0) = 20.0

    Strength of Earth (Strength, earth) → 0 (nobody benefits from Strength)

    Total = 16.0 + 20.0 = 36.0
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

    All provide Battle Shout (AttackPower, shout, w=2, stack_decay=0).
    Deduplicated to one instance regardless of provider count.

    AttackPower weights: Fury=1.0, Arms=0.9
    Battle Shout realised = 2 * (1.0+1.0+0.9+0.9) = 2 * 3.8 = 7.6

    No other party buffs in this group.
    Total = 7.6
    """
    group = [
        p("w1", "Warrior", "Fury"),
        p("w2", "Warrior", "Fury"),
        p("w3", "Warrior", "Arms"),
        p("w4", "Warrior", "Arms"),
    ]
    assert score_group(group, SPECS, BUFFS) == pytest.approx(7.6, abs=1e-6)
