from .data_loader import Buff, Player
from .scorer import score_group, score_partition


def _kt_set_of(player_id: str, kt_sets: list[frozenset]) -> frozenset | None:
    for s in kt_sets:
        if player_id in s:
            return s
    return None


def _can_swap(
    pi: Player, group_i: list[Player],
    pj: Player, group_j: list[Player],
    kt_sets: list[frozenset],
) -> bool:
    """
    A swap is invalid if either player is part of a KT set that has other members
    still in their current group — moving them alone would split the set.
    """
    kt_i = _kt_set_of(pi.id, kt_sets)
    if kt_i and any(p != pi and p.id in kt_i for p in group_i):
        return False
    kt_j = _kt_set_of(pj.id, kt_sets)
    if kt_j and any(p != pj and p.id in kt_j for p in group_j):
        return False
    return True


def greedy_assign(
    players: list[Player],
    kt_sets: list[frozenset],
    n_groups: int,
    specs_lookup: dict,
    buffs: list[Buff],
) -> list[list[Player]]:
    capacity = 5
    groups: list[list[Player]] = [[] for _ in range(n_groups)]
    in_kt = {pid for s in kt_sets for pid in s}

    # Place keep-together sets first as atomic units
    for kt_set in kt_sets:
        kt_players = [p for p in players if p.id in kt_set]
        placed = False
        for group in groups:
            if len(group) + len(kt_players) <= capacity:
                group.extend(kt_players)
                placed = True
                break
        if not placed:
            raise ValueError(
                f"Keep-together set of size {len(kt_players)} cannot fit in any group"
            )

    # Place remaining players by marginal score gain
    for player in (p for p in players if p.id not in in_kt):
        best_group = None
        best_gain = float("-inf")
        for group in groups:
            if len(group) < capacity:
                gain = (
                    score_group(group + [player], specs_lookup, buffs)
                    - score_group(group, specs_lookup, buffs)
                )
                if gain > best_gain:
                    best_gain = gain
                    best_group = group
        if best_group is None:
            raise ValueError("Cannot place all players — roster exceeds total group capacity")
        best_group.append(player)

    return groups


def hill_climb(
    groups: list[list[Player]],
    kt_sets: list[frozenset],
    specs_lookup: dict,
    buffs: list[Buff],
) -> list[list[Player]]:
    capacity = 5
    improved = True
    while improved:
        improved = False
        n = len(groups)

        # --- pairwise swaps ---
        for i in range(n):
            for j in range(i + 1, n):
                gi, gj = groups[i], groups[j]
                for pi_idx in range(len(gi)):
                    for pj_idx in range(len(gj)):
                        pi, pj = gi[pi_idx], gj[pj_idx]
                        if not _can_swap(pi, gi, pj, gj, kt_sets):
                            continue
                        old = (
                            score_group(gi, specs_lookup, buffs)
                            + score_group(gj, specs_lookup, buffs)
                        )
                        gi[pi_idx], gj[pj_idx] = pj, pi
                        new = (
                            score_group(gi, specs_lookup, buffs)
                            + score_group(gj, specs_lookup, buffs)
                        )
                        if new > old:
                            improved = True
                        else:
                            gi[pi_idx], gj[pj_idx] = pi, pj  # undo

        # --- moves into groups with a free slot (partial rosters) ---
        if not improved:
            for i in range(n):
                for j in range(n):
                    if i == j or len(groups[j]) >= capacity:
                        continue
                    for pi_idx in range(len(groups[i])):
                        pi = groups[i][pi_idx]
                        kt_pi = _kt_set_of(pi.id, kt_sets)
                        if kt_pi and any(p != pi and p.id in kt_pi for p in groups[i]):
                            continue
                        old = (
                            score_group(groups[i], specs_lookup, buffs)
                            + score_group(groups[j], specs_lookup, buffs)
                        )
                        groups[j].append(pi)
                        groups[i].pop(pi_idx)
                        new = (
                            score_group(groups[i], specs_lookup, buffs)
                            + score_group(groups[j], specs_lookup, buffs)
                        )
                        if new > old:
                            improved = True
                            break
                        else:
                            groups[i].insert(pi_idx, pi)
                            groups[j].pop()
                    if improved:
                        break
                if improved:
                    break

    return groups


def optimize(
    players: list[Player],
    kt_sets: list[list[str]],
    raid_size: int,
    specs_lookup: dict,
    buffs: list[Buff],
) -> tuple[list[list[Player]], float]:
    """
    Returns (groups, total_score).
    raid_size must be 10 or 25.
    kt_sets is a list of player-ID lists that must share a group.
    """
    n_groups = raid_size // 5
    kt_frozen = [frozenset(s) for s in kt_sets]
    groups = greedy_assign(players, kt_frozen, n_groups, specs_lookup, buffs)
    groups = hill_climb(groups, kt_frozen, specs_lookup, buffs)
    total = score_partition(groups, specs_lookup, buffs)
    return groups, total
