from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .data_loader import Player, load_buffs, load_spec_list, load_specs
from .models import (
    ClassInfo,
    GroupOut,
    MetaResponse,
    OptimiseRequest,
    OptimiseResponse,
    PlayerOut,
    ScoreRequest,
    SpecInfo,
)
from .optimizer import optimize
from .scorer import get_active_buffs, score_group

_state: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    _state["specs_lookup"] = load_specs()
    _state["buffs"] = load_buffs()
    _state["spec_list"] = load_spec_list()
    yield
    _state.clear()


app = FastAPI(title="TBC Raid Composition Tool", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/meta", response_model=MetaResponse)
def meta():
    classes_dict: dict[str, list[SpecInfo]] = {}
    for entry in _state["spec_list"]:
        cn = entry["class_name"]
        if cn not in classes_dict:
            classes_dict[cn] = []
        classes_dict[cn].append(SpecInfo(spec=entry["spec"], role=entry["role"]))

    return MetaResponse(
        classes=[ClassInfo(class_name=cn, specs=specs) for cn, specs in classes_dict.items()]
    )


@app.post("/optimise", response_model=OptimiseResponse)
def optimise(req: OptimiseRequest):
    specs_lookup = _state["specs_lookup"]
    buffs = _state["buffs"]

    # --- validation ---
    if len(req.players) > req.raid_size:
        raise HTTPException(
            422,
            f"Roster has {len(req.players)} players but raid size is {req.raid_size}.",
        )

    ids = [p.id for p in req.players]
    if len(ids) != len(set(ids)):
        raise HTTPException(422, "Duplicate player IDs in roster.")

    id_set = set(ids)
    seen_in_kt: set[str] = set()
    for kt in req.keep_together:
        for pid in kt:
            if pid not in id_set:
                raise HTTPException(
                    422, f"Keep-together player ID '{pid}' is not in the roster."
                )
        if len(kt) > 5:
            raise HTTPException(422, "A keep-together set cannot exceed group capacity of 5.")
        overlap = seen_in_kt & set(kt)
        if overlap:
            raise HTTPException(
                422, f"Player ID(s) {overlap} appear in more than one keep-together set."
            )
        seen_in_kt.update(kt)

    # --- optimise with constraints ---
    players = [Player(id=p.id, class_name=p.class_name, spec=p.spec) for p in req.players]
    groups, total = optimize(players, req.keep_together, req.raid_size, specs_lookup, buffs)

    # --- optional unconstrained run for delta ---
    unconstrained_score = None
    score_delta = None
    if req.keep_together:
        _, unconstrained_score = optimize(players, [], req.raid_size, specs_lookup, buffs)
        score_delta = round(total - unconstrained_score, 2)
        unconstrained_score = round(unconstrained_score, 2)

    # --- build response ---
    groups_out = [
        GroupOut(
            players=[PlayerOut(id=p.id, class_name=p.class_name, spec=p.spec) for p in group],
            score=round(score_group(group, specs_lookup, buffs), 2),
            active_buffs=get_active_buffs(group, specs_lookup, buffs),
        )
        for group in groups
    ]

    return OptimiseResponse(
        groups=groups_out,
        total_score=round(total, 2),
        unconstrained_score=unconstrained_score,
        score_delta=score_delta,
    )


@app.post("/score", response_model=OptimiseResponse)
def score(req: ScoreRequest):
    """Score a manually-arranged partition without re-running the algorithm."""
    specs_lookup = _state["specs_lookup"]
    buffs = _state["buffs"]

    groups = [
        [Player(id=p.id, class_name=p.class_name, spec=p.spec) for p in group]
        for group in req.groups
    ]
    groups_out = [
        GroupOut(
            players=[PlayerOut(id=p.id, class_name=p.class_name, spec=p.spec) for p in group],
            score=round(score_group(group, specs_lookup, buffs), 2),
            active_buffs=get_active_buffs(group, specs_lookup, buffs),
        )
        for group in groups
    ]
    total = round(sum(g.score for g in groups_out), 2)
    return OptimiseResponse(groups=groups_out, total_score=total)
