(function () {
  "use strict";

  function maskFromMatrixRow(row) {
    let mask = 0;
    for (let index = 0; index < row.length; index += 1) {
      if (row[index]) mask |= 1 << index;
    }
    return mask;
  }

  function coordKey(x, y) {
    const offset = 10000000;
    const stride = 20000001;
    if (x >= -offset && x <= offset && y >= -offset && y <= offset) {
      return (x + offset) * stride + y + offset;
    }
    return `${x},${y}`;
  }

  function flattenConfig(config) {
    const finiteStarts = [];
    const finiteCounts = [];
    const finiteOffsets = [];
    const rayStarts = [];
    const rayCounts = [];
    const rayOffsets = [];

    for (const piece of config.pieces) {
      const shape = config.shapes[piece.shapeName] || [];
      finiteStarts.push(finiteOffsets.length / 2);
      rayStarts.push(rayOffsets.length / 2);
      let finiteCount = 0;
      let rayCount = 0;

      for (const tuple of shape) {
        const dx = Number(tuple[0]);
        const dy = Number(tuple[1]);
        if (tuple[2] === "infinite") {
          rayOffsets.push(dx, dy);
          rayCount += 1;
        } else {
          finiteOffsets.push(dx, dy);
          finiteCount += 1;
        }
      }
      finiteCounts.push(finiteCount);
      rayCounts.push(rayCount);
    }

    return {
      finiteStarts: Uint32Array.from(finiteStarts),
      finiteCounts: Uint32Array.from(finiteCounts),
      finiteOffsets: Int32Array.from(finiteOffsets),
      rayStarts: Uint32Array.from(rayStarts),
      rayCounts: Uint32Array.from(rayCounts),
      rayOffsets: Int32Array.from(rayOffsets),
      attackMasks: Uint32Array.from(config.attackedBy.map(maskFromMatrixRow)),
    };
  }

  function copyIntoWasm(exports, TypedArray, values) {
    const bytes = Math.max(1, values.byteLength);
    const ptr = exports.alloc(bytes);
    if (values.length > 0) {
      new TypedArray(exports.memory.buffer, ptr, values.length).set(values);
    }
    return { ptr, bytes };
  }

  async function load(url = "wasm_sim.wasm") {
    if (location.protocol === "file:") {
      throw new Error("WASM cannot be loaded from file://. Serve the app over http://127.0.0.1.");
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, {});
    const exports = instance.exports;

    return {
      run(config) {
        const flat = flattenConfig(config);
        const finiteStarts = copyIntoWasm(exports, Uint32Array, flat.finiteStarts);
        const finiteCounts = copyIntoWasm(exports, Uint32Array, flat.finiteCounts);
        const finiteOffsets = copyIntoWasm(exports, Int32Array, flat.finiteOffsets);
        const rayStarts = copyIntoWasm(exports, Uint32Array, flat.rayStarts);
        const rayCounts = copyIntoWasm(exports, Uint32Array, flat.rayCounts);
        const rayOffsets = copyIntoWasm(exports, Int32Array, flat.rayOffsets);
        const attackMasks = copyIntoWasm(exports, Uint32Array, flat.attackMasks);

        try {
          exports.simulate(
            config.turns,
            config.pieces.length,
            finiteStarts.ptr,
            finiteCounts.ptr,
            finiteOffsets.ptr,
            flat.finiteOffsets.length,
            rayStarts.ptr,
            rayCounts.ptr,
            rayOffsets.ptr,
            flat.rayOffsets.length,
            attackMasks.ptr,
          );
        } finally {
          for (const allocation of [
            finiteStarts,
            finiteCounts,
            finiteOffsets,
            rayStarts,
            rayCounts,
            rayOffsets,
            attackMasks,
          ]) {
            exports.dealloc(allocation.ptr, allocation.bytes);
          }
        }

        const placementCount = exports.result_placement_count();
        const attackedLen = exports.result_attacked_masks_len();
        const memory = exports.memory.buffer;
        const pieceXs = new Int32Array(
          new Int32Array(memory, exports.result_piece_xs_ptr(), placementCount),
        );
        const pieceYs = new Int32Array(
          new Int32Array(memory, exports.result_piece_ys_ptr(), placementCount),
        );
        const pieceTypes = new Uint8Array(
          new Uint8Array(memory, exports.result_piece_types_ptr(), placementCount),
        );
        const attackedMasks = new Uint32Array(
          new Uint32Array(memory, exports.result_attacked_masks_ptr(), attackedLen),
        );

        const occupiedCoords = new Map();
        for (let index = 0; index < placementCount; index += 1) {
          occupiedCoords.set(coordKey(pieceXs[index], pieceYs[index]), index);
        }

        return {
          occupiedLabels: new Uint8Array(0),
          occupiedCoords,
          pieceXs,
          pieceYs,
          pieceTypes,
          attackedMasks,
          placementCount,
          maxKnownLabel: exports.result_max_known_label(),
          maxPlacedLabel: exports.result_max_placed_label(),
          maxAbsCoord: exports.result_max_abs_coord(),
          searchSteps: exports.result_search_steps(),
          warning:
            exports.result_warning_code() === 1
              ? "Stopped early: search safety limit reached."
              : "",
        };
      },
    };
  }

  window.WasmSimulator = { load };
})();
