import { useState, useEffect, useCallback, useRef } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  pointerWithin,
} from '@dnd-kit/core'
import './App.css'

const API = 'http://localhost:8000'
const KT_LABELS = ['A', 'B', 'C', 'D', 'E']

const TANK_KEYS   = new Set(['Warrior/Protection', 'Paladin/Protection', 'Druid/Feral (Bear)'])
const HEALER_KEYS = new Set(['Paladin/Holy', 'Priest/Discipline', 'Priest/Holy', 'Shaman/Restoration', 'Druid/Restoration'])

// Relative likelihood weights for fill sample. Missing entries default to 1.
const SPEC_WEIGHTS = {
  // Tanks
  'Warrior/Protection':   10,
  'Paladin/Protection':   10,
  'Druid/Feral (Bear)':   10,
  // Healers
  'Paladin/Holy':         10,
  'Priest/Holy':          10,
  'Priest/Discipline':    6,
  'Shaman/Restoration':   10,
  'Druid/Restoration':    8,
  // Melee DPS
  'Warrior/Arms':         3,
  'Warrior/Fury':         10,
  'Paladin/Retribution':  10,
  'Rogue/Any':            10,
  'Shaman/Enhancement':   8,
  'Druid/Feral (Cat)':    6,
  // Ranged / Caster DPS
  'Hunter/Beast Mastery': 10,
  'Hunter/Marksmanship':  1,
  'Hunter/Survival':      2,
  'Priest/Shadow':        6,
  'Shaman/Elemental':     8,
  'Mage/Arcane':          10,
  'Mage/Fire':            3,
  'Mage/Frost':           3,
  'Warlock/Affliction':   2,
  'Warlock/Demonology':   1,
  'Warlock/Destruction':  10,
  'Druid/Balance':        6,
}

const ROLE_ICONS = {
  Tank:   '/icons/tank.jpg',
  Healer: '/icons/healer.jpg',
  Melee:  '/icons/melee.jpg',
  Ranged: '/icons/ranged.jpg',
}

const ROLE_MAP = {
  'Warrior/Arms': 'Melee',        'Warrior/Fury': 'Melee',       'Warrior/Protection': 'Tank',
  'Paladin/Holy': 'Healer',       'Paladin/Protection': 'Tank',   'Paladin/Retribution': 'Melee',
  'Hunter/Beast Mastery': 'Ranged', 'Hunter/Marksmanship': 'Ranged', 'Hunter/Survival': 'Ranged',
  'Rogue/Any': 'Melee',
  'Priest/Discipline': 'Healer',  'Priest/Holy': 'Healer',       'Priest/Shadow': 'Ranged',
  'Shaman/Elemental': 'Ranged',   'Shaman/Enhancement': 'Melee', 'Shaman/Restoration': 'Healer',
  'Mage/Arcane': 'Ranged',        'Mage/Fire': 'Ranged',         'Mage/Frost': 'Ranged',
  'Warlock/Affliction': 'Ranged', 'Warlock/Demonology': 'Ranged','Warlock/Destruction': 'Ranged',
  'Druid/Balance': 'Ranged',      'Druid/Feral (Cat)': 'Melee',
  'Druid/Feral (Bear)': 'Tank',   'Druid/Restoration': 'Healer',
}

const ROLE_ORDER = { Tank: 0, Healer: 1, Ranged: 2, Melee: 3 }

const CLASS_COLORS = {
  Warrior: '#C69B3A',
  Paladin: '#F48CBA',
  Hunter:  '#AAD372',
  Rogue:   '#FFF468',
  Priest:  '#FFFFFF',
  Shaman:  '#0070DD',
  Mage:    '#3FC7EB',
  Warlock: '#8788EE',
  Druid:   '#FF7C0A',
}

function makeId() {
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function makeLabel(cls, spec, n) {
  const base = spec === 'Any' ? cls : `${spec} ${cls}`
  return n <= 1 ? base : `${base} ${n}`
}

function specIcon(className, spec) {
  const slug = `${className}-${spec}`
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/-$/, '')
  return `/icons/${slug}.jpg`
}

// Player-chip droppables take priority over group-card droppables
function collisionDetection(args) {
  const playerHits = pointerWithin({
    ...args,
    droppableContainers: args.droppableContainers.filter(c =>
      c.id.toString().startsWith('player-drop-')
    ),
  })
  if (playerHits.length > 0) return playerHits
  return pointerWithin({
    ...args,
    droppableContainers: args.droppableContainers.filter(c =>
      c.id.toString().startsWith('group-')
    ),
  })
}

// ── Draggable + droppable player chip inside a group card ────────────
function DraggablePlayer({ player, groupIdx }) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: player.id,
    data: { player, groupIdx },
  })
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `player-drop-${player.id}`,
    data: { player, groupIdx },
  })
  const setRef = useCallback(node => { setDragRef(node); setDropRef(node) }, [setDragRef, setDropRef])

  return (
    <li
      ref={setRef}
      className={`group-player draggable ${isDragging ? 'dragging' : ''} ${isOver && !isDragging ? 'player-drop-target' : ''}`}
      style={{ borderLeftColor: CLASS_COLORS[player.class_name] ?? '#666' }}
      {...attributes}
      {...listeners}
    >
      <img
        src={specIcon(player.class_name, player.spec)}
        alt=""
        className="spec-icon"
        onError={e => { e.target.style.display = 'none' }}
      />
      {player.label ?? `${player.spec} ${player.class_name}`}
      <img
        src={ROLE_ICONS[ROLE_MAP[`${player.class_name}/${player.spec}`] ?? 'Ranged']}
        alt=""
        className="spec-icon role-icon"
        onError={e => { e.target.style.display = 'none' }}
      />
    </li>
  )
}

// ── Droppable group card ─────────────────────────────────────────────
function DroppableGroupCard({ index, group, isOver, isLeftover }) {
  const { setNodeRef } = useDroppable({ id: `group-${index - 1}` })
  return (
    <div
      ref={setNodeRef}
      className={`group-card ${isOver ? 'drop-target' : ''}`}
    >
      <div className="group-header">
        <span className="group-title">
          Group {index}
          {isLeftover && (
            <span
              className="leftover-warning"
              title="Less than ideal synergy; these classes share few beneficial buffs with each other, lacks strong synergising buffs or lose value from contradicting class archetypes."
            >⚠</span>
          )}
        </span>
        <span className="group-score">{group.score} pts</span>
      </div>
      <ul className="group-players">
        {[...group.players]
          .sort((a, b) => {
            const ra = ROLE_ORDER[ROLE_MAP[`${a.class_name}/${a.spec}`] ?? 'Ranged'] ?? 2
            const rb = ROLE_ORDER[ROLE_MAP[`${b.class_name}/${b.spec}`] ?? 'Ranged'] ?? 2
            return ra !== rb ? ra - rb : a.class_name.localeCompare(b.class_name)
          })
          .map(p => (
            <DraggablePlayer key={p.id} player={p} groupIdx={index - 1} />
          ))}
        {group.players.length === 0 && (
          <li className="group-player dim" style={{ borderLeftColor: 'transparent' }}>
            Empty
          </li>
        )}
      </ul>
      {group.active_buffs.length > 0 && (
        <div className="buff-list">
          {group.active_buffs.map(b => {
            const color = CLASS_COLORS[b.class_name] ?? 'var(--dim)'
            return (
              <span
                key={b.ability}
                className="buff-tag"
                style={{ borderColor: color, color }}
              >
                {b.count > 1 ? `${b.ability} ×${b.count}` : b.ability}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main App ─────────────────────────────────────────────────────────
export default function App() {
  const [meta, setMeta]           = useState(null)
  const [metaError, setMetaError] = useState(null)
  const [raidSize, setRaidSize]   = useState(25)
  const [players, setPlayers]     = useState([])
  const [selClass, setSelClass]   = useState('')
  const [selSpec, setSelSpec]     = useState('')
  const [results, setResults]     = useState(null)
  const [loading, setLoading]     = useState(false)
  const [scoring, setScoring]     = useState(false)
  const [error, setError]         = useState(null)
  const [activeId, setActiveId]   = useState(null)
  const [overId, setOverId]       = useState(null)
  const [rosterTab, setRosterTab] = useState('players')
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')

  const scoreDebounce    = useRef(null)
  const optimiseDebounce = useRef(null)

  useEffect(() => {
    clearTimeout(optimiseDebounce.current)
    if (players.length === 0) { setResults(null); return }
    optimiseDebounce.current = setTimeout(optimise, 300)
  }, [players]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch(`${API}/meta`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => {
        setMeta(data)
        const first = data.classes[0]
        if (first) { setSelClass(first.class_name); setSelSpec(first.specs[0]?.spec ?? '') }
      })
      .catch(() => setMetaError('Cannot reach backend — make sure uvicorn is running on port 8000.'))
  }, [])

  const classSpecs = meta?.classes.find(c => c.class_name === selClass)?.specs ?? []

  function handleClassChange(cls) {
    setSelClass(cls)
    const specs = meta.classes.find(c => c.class_name === cls)?.specs ?? []
    setSelSpec(specs[0]?.spec ?? '')
  }

  function addPlayer() {
    if (players.length >= raidSize) return
    const n = players.filter(p => p.class_name === selClass && p.spec === selSpec).length
    const label = makeLabel(selClass, selSpec, n + 1)
    setPlayers(prev => [...prev, { id: makeId(), class_name: selClass, spec: selSpec, label, ktGroup: null }])
  }

  function removePlayer(id) {
    setPlayers(prev => prev.filter(p => p.id !== id))
  }

  function setKtGroup(id, group) {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, ktGroup: group || null } : p))
  }

  function clearAll() {
    setPlayers([])
    setResults(null)
    setError(null)
  }

  function commitLabel(id) {
    const trimmed = editValue.trim()
    if (trimmed) {
      setPlayers(prev => prev.map(p => p.id === id ? { ...p, label: trimmed } : p))
      setResults(prev => prev ? {
        ...prev,
        groups: prev.groups.map(g => ({
          ...g,
          players: g.players.map(p => p.id === id ? { ...p, label: trimmed } : p),
        })),
      } : prev)
    }
    setEditingId(null)
  }

  function weightedPick(specs) {
    const weights = specs.map(s => SPEC_WEIGHTS[`${s.class_name}/${s.spec}`] ?? 1)
    const total = weights.reduce((a, b) => a + b, 0)
    let r = Math.random() * total
    for (let i = 0; i < specs.length; i++) {
      r -= weights[i]
      if (r <= 0) return specs[i]
    }
    return specs[specs.length - 1]
  }

  // Weighted pick without replacement — used for tanks/healers where we want distinct specs.
  function weightedPickN(specs, n) {
    const result = []
    let remaining = [...specs]
    for (let i = 0; i < n && remaining.length > 0; i++) {
      const picked = weightedPick(remaining)
      result.push(picked)
      remaining = remaining.filter(s => s !== picked)
    }
    return result
  }

  function fillRoster() {
    const allSpecs = meta.classes.flatMap(c =>
      c.specs.map(s => ({ class_name: c.class_name, spec: s.spec }))
    )
    const key = s => `${s.class_name}/${s.spec}`
    const tanks   = allSpecs.filter(s => TANK_KEYS.has(key(s)))
    const healers  = allSpecs.filter(s => HEALER_KEYS.has(key(s)))

    const healerCount = raidSize === 10 ? 2 : 5
    const pool = [
      ...weightedPickN(tanks, 2),
      ...weightedPickN(healers, healerCount),
    ]

    const dpsSpecs = allSpecs.filter(s => !TANK_KEYS.has(key(s)) && !HEALER_KEYS.has(key(s)))
    while (pool.length < raidSize) {
      pool.push(weightedPick(dpsSpecs))
    }

    const labelCounts = {}
    const newPlayers = pool.map(({ class_name, spec }) => {
      const key = `${spec}/${class_name}`
      labelCounts[key] = (labelCounts[key] ?? 0) + 1
      return { id: makeId(), class_name, spec, label: makeLabel(class_name, spec, labelCounts[key]), ktGroup: null }
    })

    setPlayers(newPlayers)
    setResults(null)
    setError(null)
  }

  async function optimise() {
    setLoading(true)
    setError(null)

    const ktMap = {}
    players.forEach(p => {
      if (p.ktGroup) { ktMap[p.ktGroup] = ktMap[p.ktGroup] ?? []; ktMap[p.ktGroup].push(p.id) }
    })
    const keep_together = Object.values(ktMap).filter(g => g.length > 1)

    try {
      const resp = await fetch(`${API}/optimise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raid_size: raidSize,
          players: players.map(({ id, class_name, spec }) => ({ id, class_name, spec })),
          keep_together,
        }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        const msg = Array.isArray(data.detail)
          ? data.detail.map(d => d.msg).join('; ')
          : (data.detail ?? 'Optimisation failed.')
        throw new Error(msg)
      }
      const labelMap = Object.fromEntries(players.map(p => [p.id, p.label]))
      data.groups = data.groups.map(g => ({
        ...g,
        players: g.players.map(p => ({ ...p, label: labelMap[p.id] })),
      }))
      setResults(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const rescoreGroups = useCallback(async (groups) => {
    setScoring(true)
    try {
      const resp = await fetch(`${API}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groups: groups.map(g =>
            g.players.map(({ id, class_name, spec }) => ({ id, class_name, spec }))
          ),
        }),
      })
      if (!resp.ok) return
      const data = await resp.json()
      setResults(prev => ({
        ...prev,
        total_score: data.total_score,
        groups: prev.groups.map((g, i) => ({
          ...g,
          score: data.groups[i]?.score ?? g.score,
          active_buffs: data.groups[i]?.active_buffs ?? g.active_buffs,
        })),
      }))
    } finally {
      setScoring(false)
    }
  }, [])

  // ── dnd-kit sensors ──────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  function handleDragStart(event) {
    setActiveId(event.active.id)
  }

  function handleDragOver(event) {
    setOverId(event.over?.id ?? null)
  }

  function handleDragEnd(event) {
    setActiveId(null)
    setOverId(null)
    const { active, over } = event
    if (!over || !results) return

    const fromGroupIdx = active.data.current.groupIdx
    const playerId = active.id
    const movedPlayer = results.groups[fromGroupIdx]?.players.find(p => p.id === playerId)
    if (!movedPlayer) return

    const isPlayerTarget = over.id.toString().startsWith('player-drop-')
    let toGroupIdx
    let targetPlayerId = null

    if (isPlayerTarget) {
      targetPlayerId = over.id.toString().replace('player-drop-', '')
      if (targetPlayerId === playerId) return
      toGroupIdx = results.groups.findIndex(g => g.players.some(p => p.id === targetPlayerId))
    } else {
      toGroupIdx = parseInt(over.id.toString().replace('group-', ''), 10)
    }

    if (toGroupIdx === -1 || fromGroupIdx === toGroupIdx) return

    let newGroups
    if (isPlayerTarget) {
      // Swap the two players between their groups
      const targetPlayer = results.groups[toGroupIdx].players.find(p => p.id === targetPlayerId)
      newGroups = results.groups.map((g, i) => {
        if (i === fromGroupIdx) return { ...g, players: g.players.map(p => p.id === playerId ? targetPlayer : p) }
        if (i === toGroupIdx)   return { ...g, players: g.players.map(p => p.id === targetPlayerId ? movedPlayer : p) }
        return g
      })
    } else {
      if (results.groups[toGroupIdx].players.length >= 5) return
      newGroups = results.groups.map((g, i) => {
        if (i === fromGroupIdx) return { ...g, players: g.players.filter(p => p.id !== playerId) }
        if (i === toGroupIdx)   return { ...g, players: [...g.players, movedPlayer] }
        return g
      })
    }

    setResults(prev => ({ ...prev, groups: newGroups }))
    clearTimeout(scoreDebounce.current)
    scoreDebounce.current = setTimeout(() => rescoreGroups(newGroups), 150)
  }

  const draggedPlayer = activeId && results
    ? results.groups.flatMap(g => g.players).find(p => p.id === activeId)
    : null

  if (metaError) return <div className="fullscreen-msg error-msg">{metaError}</div>
  if (!meta)     return <div className="fullscreen-msg">Connecting to backend…</div>

  return (
    <div className="app">
      <header className="app-header">
        <h1>TBC Raid Composition Tool</h1>
      </header>

      <div className="raid-size-bar">
        <span className="dim">Raid size:</span>
        {[10, 25].map(n => (
          <button
            key={n}
            className={`size-btn ${raidSize === n ? 'active' : ''}`}
            onClick={() => { setRaidSize(n); clearAll() }}
          >
            {n}-man
          </button>
        ))}
        <span className="dim player-count">{players.length} / {raidSize} players</span>
      </div>

      <div className="main-layout">
        {/* ── ROSTER ── */}
        <aside className="panel roster-panel">
          <div className="panel-header">
            <h2>Roster</h2>
            <div className="header-actions">
              <button className="ghost-btn" onClick={fillRoster}>Fill sample</button>
              {players.length > 0 && (
                <button className="ghost-btn danger" onClick={clearAll}>Clear all</button>
              )}
            </div>
          </div>

          <div className="roster-tabs">
            <button
              className={`tab-btn ${rosterTab === 'players' ? 'active' : ''}`}
              onClick={() => setRosterTab('players')}
            >
              Players
            </button>
            <button
              className={`tab-btn ${rosterTab === 'keep-together' ? 'active' : ''}`}
              onClick={() => setRosterTab('keep-together')}
            >
              Group Together
            </button>
          </div>

          {rosterTab === 'players' ? (
            <>
              <div className="add-row">
                <select value={selClass} onChange={e => handleClassChange(e.target.value)}>
                  {meta.classes.map(c => (
                    <option key={c.class_name} value={c.class_name}>{c.class_name}</option>
                  ))}
                </select>
                <select value={selSpec} onChange={e => setSelSpec(e.target.value)}>
                  {classSpecs.map(s => (
                    <option key={s.spec} value={s.spec}>{s.spec}</option>
                  ))}
                </select>
                <button className="add-btn" onClick={addPlayer} disabled={players.length >= raidSize}>
                  + Add
                </button>
              </div>
              <div className="player-list">
                {players.length === 0 && (
                  <p className="dim hint">Add players above to build your roster.</p>
                )}
                {players.map(p => (
                  <div key={p.id} className="player-row">
                    <img
                      src={specIcon(p.class_name, p.spec)}
                      alt=""
                      className="spec-icon"
                      onError={e => { e.target.style.display = 'none' }}
                    />
                    {editingId === p.id ? (
                      <input
                        className="player-label-input"
                        style={{ borderLeftColor: CLASS_COLORS[p.class_name] ?? '#666' }}
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={() => commitLabel(p.id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter')  commitLabel(p.id)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        autoFocus
                      />
                    ) : (
                      <span
                        className="player-label"
                        style={{ borderLeftColor: CLASS_COLORS[p.class_name] ?? '#666' }}
                        onDoubleClick={() => { setEditingId(p.id); setEditValue(p.label) }}
                        title="Double-click to rename"
                      >
                        {p.label}
                      </span>
                    )}
                    {p.ktGroup && <span className="kt-badge">{p.ktGroup}</span>}
                    <button className="remove-btn" onClick={() => removePlayer(p.id)} title="Remove">✕</button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="player-list">
              {players.length === 0 ? (
                <p className="dim hint">Add players in the Players tab first.</p>
              ) : (
                <>
                  <p className="dim hint kt-hint">
                    Players sharing a letter will be placed in the same group.
                  </p>
                  {players.map(p => (
                    <div key={p.id} className="player-row">
                      <span className="player-label" style={{ borderLeftColor: CLASS_COLORS[p.class_name] ?? '#666' }}>
                        {p.label}
                      </span>
                      <select
                        className="kt-select"
                        value={p.ktGroup ?? ''}
                        onChange={e => setKtGroup(p.id, e.target.value)}
                      >
                        <option value="">—</option>
                        {KT_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          <button className="optimise-btn" onClick={optimise} disabled={loading || players.length === 0}>
            {loading ? 'Optimising…' : 'Optimise →'}
          </button>

          {error && <p className="error-text">{error}</p>}
        </aside>

        {/* ── RESULTS ── */}
        <section className="panel results-panel">
          <div className="panel-header">
            <h2>Groups</h2>
            {(scoring || loading) && <span className="dim" style={{ fontSize: 12 }}>{loading ? 'Optimising…' : 'Scoring…'}</span>}
          </div>

          {!results && !loading && (
            <p className="dim hint">Add players to your roster to see groups form.</p>
          )}
          {!results && loading && <p className="dim hint">Running…</p>}

          {results && (
            <>
              <div className="score-bar">
                <span className="total-score">
                  Total score: <strong>{results.total_score}</strong>
                </span>
                {results.score_delta !== null && (
                  <span className={`kt-delta ${results.score_delta < 0 ? 'negative' : 'positive'}`}>
                    {results.score_delta < 0
                      ? `Group-together cost: ${results.score_delta} pts (unconstrained: ${results.unconstrained_score})`
                      : 'Group-together constraints had no cost'}
                  </span>
                )}
                <span className="dim drag-hint">Drag players between groups to adjust manually.</span>
              </div>

              <DndContext
                sensors={sensors}
                collisionDetection={collisionDetection}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
              >
                <div className="groups-grid">
                  {(() => {
                    const nonEmpty = results.groups.filter(g => g.players.length > 0)
                    const mean = nonEmpty.length > 0
                      ? nonEmpty.reduce((s, g) => s + g.score, 0) / nonEmpty.length
                      : 0
                    const threshold = mean * 0.8
                    return results.groups
                      .filter(g => g.players.length > 0 || nonEmpty.length > 0)
                      .map((group, i) => (
                        <DroppableGroupCard
                          key={i}
                          index={i + 1}
                          group={group}
                          isOver={overId === `group-${i}`}
                          isLeftover={
                            group.players.length > 0 &&
                            nonEmpty.length >= 3 &&
                            group.score < threshold
                          }
                        />
                      ))
                  })()}
                </div>

                <DragOverlay>
                  {draggedPlayer && (
                    <div
                      className="drag-overlay-chip"
                      style={{ borderLeftColor: CLASS_COLORS[draggedPlayer.class_name] ?? '#666' }}
                    >
                      <img
                        src={specIcon(draggedPlayer.class_name, draggedPlayer.spec)}
                        alt=""
                        className="spec-icon"
                        onError={e => { e.target.style.display = 'none' }}
                      />
                      {draggedPlayer.label ?? `${draggedPlayer.spec} ${draggedPlayer.class_name}`}
                    </div>
                  )}
                </DragOverlay>
              </DndContext>

              {(() => {
                const roles = { Tank: 0, Healer: 0, Melee: 0, Ranged: 0 }
                const classes = {}
                results.groups.forEach(g => g.players.forEach(p => {
                  roles[ROLE_MAP[`${p.class_name}/${p.spec}`] ?? 'Ranged']++
                  classes[p.class_name] = (classes[p.class_name] ?? 0) + 1
                }))
                const classEntries = Object.keys(CLASS_COLORS)
                  .map(c => [c, classes[c] ?? 0])
                return (
                  <>
                    <div className="raid-stats">
                      {[['Tank','Tanks'],['Healer','Healers'],['Melee','Melee DPS'],['Ranged','Ranged DPS']].map(([role, label]) => (
                        <span key={role} className="stat-item">
                          <img src={ROLE_ICONS[role]} alt={label} className="spec-icon" onError={e => { e.target.style.display = 'none' }} />
                          <span className="stat-label">{label}</span>
                          <strong>{roles[role]}</strong>
                        </span>
                      ))}
                    </div>
                    <div className="raid-stats">
                      {classEntries.map(([cls, n]) => (
                        <span key={cls} className="stat-item">
                          <img
                            src={`/icons/${cls.toLowerCase()}.jpg`}
                            alt=""
                            className="spec-icon"
                            onError={e => { e.target.style.display = 'none' }}
                          />
                          <span className="stat-label">{cls}</span>
                          <strong>{n}</strong>
                        </span>
                      ))}
                    </div>
                  </>
                )
              })()}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
