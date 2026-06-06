from .data_loader import Buff, Player


def get_benefits(player: Player, specs_lookup: dict) -> frozenset:
    """Return the benefit categories for a player, falling back to the 'Any' row."""
    key = (player.class_name, player.spec)
    if key in specs_lookup:
        return specs_lookup[key]
    any_key = (player.class_name, "Any")
    return specs_lookup.get(any_key, frozenset())


def get_party_buffs(player: Player, buffs: list[Buff]) -> list[Buff]:
    """Return party-scope buffs this player provides, using the spec join rules."""
    result = []
    for buff in buffs:
        if buff.scope != "party":
            continue
        if buff.class_name != player.class_name:
            continue
        if (buff.spec == "Any"
                or player.spec == buff.spec
                or player.spec.startswith(buff.spec)):
            result.append(buff)
    return result


def _realised(buff: Buff, group_benefits: list[frozenset]) -> float:
    """buff.weight × number of group members whose benefit categories overlap the buff."""
    benefiting = sum(1 for b in group_benefits if buff.category & b)
    return buff.weight * benefiting


def score_group(group: list[Player], specs_lookup: dict, buffs: list[Buff]) -> float:
    """Total party-buff synergy score for one group."""
    group_benefits = [get_benefits(p, specs_lookup) for p in group]

    seen_abilities: set[str] = set()
    total = 0.0

    for player in group:
        party_buffs = get_party_buffs(player, buffs)

        # Separate exclusive-slot buffs from always-active ones
        exclusive: dict[str, list[Buff]] = {}
        non_exclusive: list[Buff] = []
        for buff in party_buffs:
            if buff.exclusive_group:
                exclusive.setdefault(buff.exclusive_group, []).append(buff)
            else:
                non_exclusive.append(buff)

        # For each exclusive slot, keep only the buff that adds the most value
        chosen = list(non_exclusive)
        for slot_buffs in exclusive.values():
            best = max(slot_buffs, key=lambda b: _realised(b, group_benefits))
            chosen.append(best)

        # Accumulate score; same ability from two providers only counts once
        for buff in chosen:
            if buff.ability not in seen_abilities:
                seen_abilities.add(buff.ability)
                total += _realised(buff, group_benefits)

    return total


def score_partition(groups: list[list[Player]], specs_lookup: dict, buffs: list[Buff]) -> float:
    """Sum of score_group across all groups."""
    return sum(score_group(g, specs_lookup, buffs) for g in groups)
