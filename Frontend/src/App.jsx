import { useState, useEffect, useCallback, useRef } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core'
import './App.css'

const API = 'http://localhost:8000'
const KT_LABELS = ['A', 'B', 'C', 'D', 'E']
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

// ── Draggable player chip inside a group card ────────────────────────
function DraggablePlayer({ player, groupIdx }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: player.id,
    data: { player, groupIdx },
  })
  return (
    <li
      ref={setNodeRef}
      className={`group-player draggable ${isDragging ? 'dragging' : ''}`}
      style={{ borderLeftColor: CLASS_COLORS[player.class_name] ?? '#666' }}
      {...attributes}
      {...listeners}
    >
      {player.label ?? `${player.spec} ${player.class_name}`}
    </li>
  )
}

// ── Droppable group card ─────────────────────────────────────────────
function DroppableGroupCard({ index, group, isOver }) {
  const { setNodeRef } = useDroppable({ id: `group-${index - 1}` })
  return (
    <div
      ref={setNodeRef}
      className={`group-card ${isOver ? 'drop-target' : ''}`}
    >
      <div className="group-header">
        <span className="group-title">Group {index}</span>
        <span className="group-score">{group.score} pts</span>
      </div>
      <ul className="group-players">
        {group.players.map(p => (
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
          {group.active_buffs.map(b => <span key={b} className="buff-tag">{b}</span>)}
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

  const scoreDebounce = useRef(null)

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
    const label = n === 0 ? `${selSpec} ${selClass}` : `${selSpec} ${selClass} ${n + 1}`
    setPlayers(prev => [...prev, { id: makeId(), class_name: selClass, spec: selSpec, label, ktGroup: null }])
    setResults(null)
  }

  function removePlayer(id) {
    setPlayers(prev => prev.filter(p => p.id !== id))
    setResults(null)
  }

  function setKtGroup(id, group) {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, ktGroup: group || null } : p))
  }

  function clearAll() {
    setPlayers([])
    setResults(null)
    setError(null)
  }

  async function optimise() {
    setLoading(true)
    setError(null)
    setResults(null)

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

  // Re-score the current manual arrangement
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
      // Preserve player labels — only update scores and active_buffs
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
    const toGroupIdx   = parseInt(over.id.replace('group-', ''), 10)
    if (fromGroupIdx === toGroupIdx) return

    const playerId = active.id
    const fromGroup = results.groups[fromGroupIdx]
    const toGroup   = results.groups[toGroupIdx]

    if (toGroup.players.length >= 5) return

    const movedPlayer = fromGroup.players.find(p => p.id === playerId)
    if (!movedPlayer) return

    const newGroups = results.groups.map((g, i) => {
      if (i === fromGroupIdx) return { ...g, players: g.players.filter(p => p.id !== playerId) }
      if (i === toGroupIdx)   return { ...g, players: [...g.players, movedPlayer] }
      return g
    })

    setResults(prev => ({ ...prev, groups: newGroups }))

    // Debounce the re-score call by 150 ms so rapid drags don't flood the API
    clearTimeout(scoreDebounce.current)
    scoreDebounce.current = setTimeout(() => rescoreGroups(newGroups), 150)
  }

  // Find the dragged player for the overlay
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
            {players.length > 0 && (
              <button className="ghost-btn danger" onClick={clearAll}>Clear all</button>
            )}
          </div>

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
            {players.length === 0 && <p className="dim hint">Add players above to build your roster.</p>}
            {players.map(p => (
              <div key={p.id} className="player-row">
                <span className="player-label" style={{ borderLeftColor: CLASS_COLORS[p.class_name] ?? '#666' }}>
                  {p.label}
                </span>
                <select
                  className="kt-select"
                  value={p.ktGroup ?? ''}
                  onChange={e => setKtGroup(p.id, e.target.value)}
                  title="Lock together with players in the same group"
                >
                  <option value="">—</option>
                  {KT_LABELS.map(l => <option key={l} value={l}>Lock {l}</option>)}
                </select>
                <button className="remove-btn" onClick={() => removePlayer(p.id)} title="Remove">✕</button>
              </div>
            ))}
          </div>

          <button className="optimise-btn" onClick={optimise} disabled={loading || players.length === 0}>
            {loading ? 'Optimising…' : 'Optimise →'}
          </button>

          {error && <p className="error-text">{error}</p>}
        </aside>

        {/* ── RESULTS ── */}
        <section className="panel results-panel">
          <div className="panel-header">
            <h2>Groups</h2>
            {scoring && <span className="dim" style={{ fontSize: 12 }}>Scoring…</span>}
          </div>

          {!results && !loading && (
            <p className="dim hint">Hit <strong>Optimise</strong> to assign players into groups.</p>
          )}
          {loading && <p className="dim hint">Running…</p>}

          {results && (
            <>
              <div className="score-bar">
                <span className="total-score">
                  Total score: <strong>{results.total_score}</strong>
                </span>
                {results.score_delta !== null && (
                  <span className={`kt-delta ${results.score_delta < 0 ? 'negative' : 'positive'}`}>
                    {results.score_delta < 0
                      ? `Keep-together cost: ${results.score_delta} pts (unconstrained: ${results.unconstrained_score})`
                      : 'Keep-together constraints had no cost'}
                  </span>
                )}
                <span className="dim drag-hint">Drag players between groups to adjust manually.</span>
              </div>

              <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
              >
                <div className="groups-grid">
                  {results.groups
                    .filter(g => g.players.length > 0 || results.groups.some(x => x.players.length > 0))
                    .map((group, i) => (
                      <DroppableGroupCard
                        key={i}
                        index={i + 1}
                        group={group}
                        isOver={overId === `group-${i}`}
                      />
                    ))
                  }
                </div>

                <DragOverlay>
                  {draggedPlayer && (
                    <div
                      className="drag-overlay-chip"
                      style={{ borderLeftColor: CLASS_COLORS[draggedPlayer.class_name] ?? '#666' }}
                    >
                      {draggedPlayer.label ?? `${draggedPlayer.spec} ${draggedPlayer.class_name}`}
                    </div>
                  )}
                </DragOverlay>
              </DndContext>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
