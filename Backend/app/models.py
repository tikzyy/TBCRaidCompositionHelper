from typing import Literal

from pydantic import BaseModel


class PlayerIn(BaseModel):
    id: str
    class_name: str
    spec: str


class OptimiseRequest(BaseModel):
    raid_size: Literal[10, 25]
    players: list[PlayerIn]
    keep_together: list[list[str]] = []


class PlayerOut(BaseModel):
    id: str
    class_name: str
    spec: str


class BuffOut(BaseModel):
    ability: str
    class_name: str
    count: int = 1


class GroupOut(BaseModel):
    players: list[PlayerOut]
    score: float
    active_buffs: list[BuffOut]


class OptimiseResponse(BaseModel):
    groups: list[GroupOut]
    total_score: float
    unconstrained_score: float | None = None
    score_delta: float | None = None


class ScoreRequest(BaseModel):
    groups: list[list[PlayerIn]]


class SpecInfo(BaseModel):
    spec: str
    role: str


class ClassInfo(BaseModel):
    class_name: str
    specs: list[SpecInfo]


class MetaResponse(BaseModel):
    classes: list[ClassInfo]
