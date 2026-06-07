# TBC Raid Composition Helper

A web app for arranging World of Warcraft: The Burning Crusade Classic raid members
into optimal 5-player groups based on buff synergy. 

---

## Prerequisites

- **Python 3.11 or later** - [python.org/downloads](https://www.python.org/downloads/)
- **Node.js 18 or later** - [nodejs.org](https://nodejs.org/)

Both must be available on your system PATH. You can verify after installing:

```
python --version
node --version
```

> On macOS/Linux, Python may be `python3` rather than `python`. Use whichever works on
> your system. Substitute `python3` for `python` in the commands below if needed.

---

## Setup

All commands below are run from the `TBCRaidCompositionHelper/` folder (the project root)
unless a different directory is specified.

### 1. Python backend

From the project root, navigate into `Backend/` and create a virtual environment:

```
cd Backend
python -m venv .venv
```

Activate it:

**Windows**
```
.venv\Scripts\activate
```

**macOS / Linux**
```
source .venv/bin/activate
```

Your terminal prompt will show `(.venv)` when the environment is active. Install the
Python dependencies:

```
pip install -r requirements.txt
```

Return to the project root when done:

```
cd ..
```

> You will need to re-activate the virtual environment (the `activate` step above)
> whenever you open a new terminal.

### 2. Node dependencies

Install the root-level launcher package:

```
npm install
```

Then install the frontend dependencies:

```
cd Frontend
npm install
cd ..
```

---

## Running

From the project root (`TBCRaidCompositionHelper/`), start both servers with:

```
npm run dev
```

This launches:
- **Backend** at http://localhost:8000
- **Frontend** at http://localhost:5173

Open **http://localhost:5173** in your browser. Press `Ctrl+C` in the terminal to stop
both servers.

---

## Using the app

1. **Select a raid size** - 10-man (2 groups of 5) or 25-man (5 groups of 5).
2. **Add players** —-use the class and spec dropdowns to add each member of your roster.
   Double-click a player's name label at any time to rename them.
3. **Group Together (optional)** - open the Group Together tab to mark sets of players
   who must be placed in the same group. Assign each player a letter (A, B, C…); players
   sharing a letter will always end up together.
4. **Optimise** - groups are assigned automatically as you build the roster. The score
   bar reflects how well the current arrangement makes use of party buffs.
5. **Drag to adjust** - drag any player chip to a different group card to move them, or
   drop them onto another player to swap. Scores update live after each drag.
