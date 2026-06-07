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


def _realised(buff: Buff, group_benefits: list[dict[str, float]], weight: float | None = None) -> float:
    """(weight or buff.weight) × sum of per-player benefit weights.

    For each player, take the maximum weight across any of the buff's categories
    that the player benefits from (handles multi-category buffs like Melee+Ranged).
    Players with no matching category contribute 0.
    """
    w = weight if weight is not None else float(buff.weight)
    total = sum(
        max((pb[cat] for cat in buff.category if cat in pb), default=0.0)
        for pb in group_benefits
    )
    return w * total


def _chosen_buffs(
    group: list[Player], specs_lookup: dict, buffs: list[Buff]
) -> tuple[list[tuple[Buff, float]], list[dict[str, float]]]:
    """
    Core selection logic shared by score_group and get_active_buffs.
    Returns ([(buff, effective_weight), ...], group_benefits) after exclusive-slot
    selection and deduplication/stack-decay handling.

    Buffs with stack_decay == 0.0 are deduplicated (only first provider counts).
    Buffs with stack_decay > 0.0 allow additional providers at decaying weight:
      2nd copy: weight * decay, 3rd copy: weight * decay^2, etc.
    """
    group_benefits = [get_benefits(p, specs_lookup) for p in group]
    ability_count: dict[str, int] = {}
    chosen: list[tuple[Buff, float]] = []

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
            count = ability_count.get(buff.ability, 0)
            if count == 0:
                ability_count[buff.ability] = 1
                chosen.append((buff, float(buff.weight)))
            elif buff.stack_decay > 0.0:
                effective_weight = buff.weight * (buff.stack_decay ** count)
                ability_count[buff.ability] = count + 1
                chosen.append((buff, effective_weight))
            # else: stack_decay == 0.0, skip duplicate

    return chosen, group_benefits


def score_group(group: list[Player], specs_lookup: dict, buffs: list[Buff]) -> float:
    """Total party-buff synergy score for one group."""
    chosen, group_benefits = _chosen_buffs(group, specs_lookup, buffs)
    return sum(_realised(b, group_benefits, w) for b, w in chosen)


def get_active_buffs(group: list[Player], specs_lookup: dict, buffs: list[Buff]) -> list[dict]:
    """Party buffs active in this group that at least one member benefits from."""
    chosen, group_benefits = _chosen_buffs(group, specs_lookup, buffs)
    result: list[dict] = []
    index: dict[str, int] = {}
    for b, _ in chosen:
        if _realised(b, group_benefits) == 0:
            continue
        if b.ability in index:
            result[index[b.ability]]["count"] += 1
        else:
            index[b.ability] = len(result)
            result.append({"ability": b.ability, "class_name": b.class_name, "count": 1})
    return result


def score_partition(groups: list[list[Player]], specs_lookup: dict, buffs: list[Buff]) -> float:
    """Sum of score_group across all groups."""
    return sum(score_group(g, specs_lookup, buffs) for g in groups)
