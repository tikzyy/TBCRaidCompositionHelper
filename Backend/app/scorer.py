from .data_loader import Buff, Player


def get_benefits(player: Player, specs_lookup: dict) -> dict[str, float]:
    """Return {category: weight} for a player, falling back to the 'Any' row."""
    key = (player.class_name, player.spec)
    if key in specs_lookup:
        return specs_lookup[key]
    any_key = (player.class_name, "Any")
    return specs_lookup.get(any_key, {})


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


def _realised(buff: Buff, group_benefits: list[dict[str, float]]) -> float:
    """buff.weight × sum of per-player benefit weights.

    For each player, take the maximum weight across any of the buff's categories
    that the player benefits from (handles multi-category buffs like Melee+Ranged).
    Players with no matching category contribute 0.
    """
    total = sum(
        max((pb[cat] for cat in buff.category if cat in pb), default=0.0)
        for pb in group_benefits
    )
    return buff.weight * total


def _chosen_buffs(
    group: list[Player], specs_lookup: dict, buffs: list[Buff]
) -> tuple[list[Buff], list[dict[str, float]]]:
    """
    Core selection logic shared by score_group and get_active_buffs.
    Returns (chosen_buffs, group_benefits) after exclusive-slot selection and deduplication.
    """
    group_benefits = [get_benefits(p, specs_lookup) for p in group]
    seen: set[str] = set()
    chosen: list[Buff] = []

    for player in group:
        party_buffs = get_party_buffs(player, buffs)

        exclusive: dict[str, list[Buff]] = {}
        non_exclusive: list[Buff] = []
        for buff in party_buffs:
            if buff.exclusive_group:
                exclusive.setdefault(buff.exclusive_group, []).append(buff)
            else:
                non_exclusive.append(buff)

        selected = list(non_exclusive)
        for slot_buffs in exclusive.values():
            best = max(slot_buffs, key=lambda b: _realised(b, group_benefits))
            selected.append(best)

        for buff in selected:
            if buff.ability not in seen:
                seen.add(buff.ability)
                chosen.append(buff)

    return chosen, group_benefits


def score_group(group: list[Player], specs_lookup: dict, buffs: list[Buff]) -> float:
    """Total party-buff synergy score for one group."""
    chosen, group_benefits = _chosen_buffs(group, specs_lookup, buffs)
    return sum(_realised(b, group_benefits) for b in chosen)


def get_active_buffs(group: list[Player], specs_lookup: dict, buffs: list[Buff]) -> list[str]:
    """Names of party buffs active in this group after exclusive selection and deduplication."""
    chosen, _ = _chosen_buffs(group, specs_lookup, buffs)
    return [b.ability for b in chosen]


def score_partition(groups: list[list[Player]], specs_lookup: dict, buffs: list[Buff]) -> float:
    """Sum of score_group across all groups."""
    return sum(score_group(g, specs_lookup, buffs) for g in groups)
