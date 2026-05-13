# Chess Pattern Visualiser

A dependency-free web visualiser for the spiral chess placement game.

## Run

Open `index.html` directly, or serve the folder locally:

```powershell
python -m http.server 8765
```

Then visit `http://127.0.0.1:8765/`.

## Build WASM Simulator

If Rust is installed inside WSL, build the optional WASM simulator from PowerShell:

```powershell
.\scripts\build_wasm.cmd
```

If your PowerShell execution policy allows local scripts, this equivalent helper also works:

```powershell
.\scripts\build_wasm.ps1
```

This creates `wasm_sim.wasm` in the project root. Serve the folder locally so the browser can fetch the WASM file.

## Features

- Cyclic piece-type turns on the numbered spiral grid.
- Per-type colours and attack-shape dropdowns.
- Editable `attacked_by[target][attacker]` matrix.
- Built-in King, Queen, Rook, Bishop, Knight, and pawn attack shapes.
- Fairy leapers including Alfil, Dromedary, Antelope, Dabbaba, Wazir, Zebra, and Ferz.
- Custom attack-shape editor for finite offsets and infinite rays.
- Lazy infinite-ray propagation with per-square attacker bitsets.
- Dedicated finite-only simulator when selected shapes have no infinite rays.
- Matrix default is "attacks every other type, but not self."
- Relative zoom around fitted board size, with a one-click fit reset.
- Settings import/export as JSON.
