from dataclasses import dataclass
from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).parent.parent / "Data"


@dataclass(frozen=True)
class Player:
    id: str
    class_name: str
    spec: str


@dataclass(frozen=True)
class Buff:
    class_name: str
    spec: str
    ability: str
    category: frozenset
    scope: str
    exclusive_group: str  # "" when not exclusive
    weight: int


def load_specs() -> dict[tuple[str, str], frozenset]:
    """Return {(class, spec): frozenset(benefit_categories)} from specs_benefits.csv."""
    df = pd.read_csv(DATA_DIR / "specs_benefits.csv")
    result = {}
    for _, row in df.iterrows():
        cats = frozenset(c.strip() for c in str(row["benefits_from"]).split(","))
        result[(row["class"].strip(), row["spec"].strip())] = cats
    return result


def load_buffs() -> list[Buff]:
    """Return all Buff objects from provided_buffs.csv."""
    df = pd.read_csv(DATA_DIR / "provided_buffs.csv")
    buffs = []
    for _, row in df.iterrows():
        cats = frozenset(c.strip() for c in str(row["category"]).split(","))
        eg = row["exclusive_group"]
        buffs.append(Buff(
            class_name=row["class"].strip(),
            spec=row["spec"].strip(),
            ability=row["ability"].strip(),
            category=cats,
            scope=row["scope"].strip(),
            exclusive_group=eg.strip() if pd.notna(eg) and str(eg).strip() else "",
            weight=int(row["weight"]),
        ))
    return buffs
