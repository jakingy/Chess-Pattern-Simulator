use std::collections::HashMap;

#[derive(Clone, Copy)]
struct Coord {
    x: i32,
    y: i32,
}

#[derive(Clone, Copy)]
struct RayFront {
    x: i32,
    y: i32,
    dx: i32,
    dy: i32,
    mask: u32,
    direction_id: u32,
}

struct ResultData {
    piece_xs: Vec<i32>,
    piece_ys: Vec<i32>,
    piece_types: Vec<u8>,
    attacked_masks: Vec<u32>,
    placement_count: u32,
    max_known_label: u32,
    max_placed_label: u32,
    max_abs_coord: u32,
    search_steps: u32,
    warning_code: u32,
}

static mut RESULT: Option<ResultData> = None;

#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut buffer = Vec::<u8>::with_capacity(len);
    let ptr = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    ptr
}

#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    if !ptr.is_null() {
        drop(Vec::from_raw_parts(ptr, 0, len));
    }
}

#[no_mangle]
pub unsafe extern "C" fn simulate(
    turns: u32,
    type_count: u32,
    finite_starts_ptr: *const u32,
    finite_counts_ptr: *const u32,
    finite_offsets_ptr: *const i32,
    finite_offsets_len: u32,
    ray_starts_ptr: *const u32,
    ray_counts_ptr: *const u32,
    ray_offsets_ptr: *const i32,
    ray_offsets_len: u32,
    attack_masks_ptr: *const u32,
) {
    let type_count_usize = type_count as usize;
    let finite_starts = std::slice::from_raw_parts(finite_starts_ptr, type_count_usize);
    let finite_counts = std::slice::from_raw_parts(finite_counts_ptr, type_count_usize);
    let finite_offsets = std::slice::from_raw_parts(finite_offsets_ptr, finite_offsets_len as usize);
    let ray_starts = std::slice::from_raw_parts(ray_starts_ptr, type_count_usize);
    let ray_counts = std::slice::from_raw_parts(ray_counts_ptr, type_count_usize);
    let ray_offsets = std::slice::from_raw_parts(ray_offsets_ptr, ray_offsets_len as usize);
    let attack_masks = std::slice::from_raw_parts(attack_masks_ptr, type_count_usize).to_vec();

    let mut simulator = Simulator::new(
        turns,
        type_count_usize,
        finite_starts,
        finite_counts,
        finite_offsets,
        ray_starts,
        ray_counts,
        ray_offsets,
        attack_masks,
    );
    RESULT = Some(simulator.run());
}

struct Simulator {
    turns: u32,
    type_count: usize,
    finite_starts: Vec<u32>,
    finite_counts: Vec<u32>,
    finite_offsets: Vec<i32>,
    ray_starts: Vec<u32>,
    ray_counts: Vec<u32>,
    ray_offsets: Vec<i32>,
    attack_masks: Vec<u32>,
    occupied_labels: Vec<u8>,
    piece_xs: Vec<i32>,
    piece_ys: Vec<i32>,
    piece_types: Vec<u8>,
    attacked_masks: Vec<u32>,
    pending_ray_fronts: HashMap<u32, Vec<RayFront>>,
    ray_seen_masks: Vec<Vec<u32>>,
    direction_ids: Vec<(i32, i32)>,
    direction_count: u32,
    cursors: Vec<u32>,
    placement_count: u32,
    max_known_label: u32,
    max_placed_label: u32,
    max_abs_coord: u32,
    search_steps: u32,
    warning_code: u32,
    has_rays: bool,
}

impl Simulator {
    #[allow(clippy::too_many_arguments)]
    fn new(
        turns: u32,
        type_count: usize,
        finite_starts: &[u32],
        finite_counts: &[u32],
        finite_offsets: &[i32],
        ray_starts: &[u32],
        ray_counts: &[u32],
        ray_offsets: &[i32],
        attack_masks: Vec<u32>,
    ) -> Self {
        let has_rays = ray_counts.iter().any(|count| *count > 0);
        let mut simulator = Self {
            turns,
            type_count,
            finite_starts: finite_starts.to_vec(),
            finite_counts: finite_counts.to_vec(),
            finite_offsets: finite_offsets.to_vec(),
            ray_starts: ray_starts.to_vec(),
            ray_counts: ray_counts.to_vec(),
            ray_offsets: ray_offsets.to_vec(),
            attack_masks,
            occupied_labels: vec![0; 1024],
            piece_xs: Vec::with_capacity(turns as usize),
            piece_ys: Vec::with_capacity(turns as usize),
            piece_types: Vec::with_capacity(turns as usize),
            attacked_masks: vec![0; 1024],
            pending_ray_fronts: HashMap::new(),
            ray_seen_masks: Vec::new(),
            direction_ids: Vec::new(),
            direction_count: 0,
            cursors: vec![0; type_count],
            placement_count: 0,
            max_known_label: 0,
            max_placed_label: 0,
            max_abs_coord: 0,
            search_steps: 0,
            warning_code: 0,
            has_rays,
        };
        if simulator.has_rays {
            simulator.register_ray_directions();
        }
        simulator
    }

    fn run(&mut self) -> ResultData {
        if !self.has_rays {
            return self.run_finite_only();
        }

        for turn in 0..self.turns {
            let piece_type = (turn as usize) % self.type_count;
            let label = match self.find_placement(piece_type) {
                Some(label) => label,
                None => {
                    self.warning_code = 1;
                    break;
                }
            };
            self.place(label, piece_type);
        }

        ResultData {
            piece_xs: std::mem::take(&mut self.piece_xs),
            piece_ys: std::mem::take(&mut self.piece_ys),
            piece_types: std::mem::take(&mut self.piece_types),
            attacked_masks: std::mem::take(&mut self.attacked_masks),
            placement_count: self.placement_count,
            max_known_label: self.max_known_label,
            max_placed_label: self.max_placed_label,
            max_abs_coord: self.max_abs_coord,
            search_steps: self.search_steps,
            warning_code: self.warning_code,
        }
    }

    fn run_finite_only(&mut self) -> ResultData {
        for turn in 0..self.turns {
            let piece_type = (turn as usize) % self.type_count;
            let label = match self.find_placement_finite(piece_type) {
                Some(label) => label,
                None => {
                    self.warning_code = 1;
                    break;
                }
            };
            self.place_finite(label, piece_type);
        }

        ResultData {
            piece_xs: std::mem::take(&mut self.piece_xs),
            piece_ys: std::mem::take(&mut self.piece_ys),
            piece_types: std::mem::take(&mut self.piece_types),
            attacked_masks: std::mem::take(&mut self.attacked_masks),
            placement_count: self.placement_count,
            max_known_label: self.max_known_label,
            max_placed_label: self.max_placed_label,
            max_abs_coord: self.max_abs_coord,
            search_steps: self.search_steps,
            warning_code: self.warning_code,
        }
    }

    fn find_placement_finite(&mut self, piece_type: usize) -> Option<u32> {
        let blockers = self.attack_masks[piece_type];
        let mut label = self.cursors[piece_type];
        let safety_limit = 200_000u32.max(self.turns.saturating_mul(self.type_count as u32).saturating_mul(600));

        while label <= safety_limit {
            self.ensure_storage(label);
            self.search_steps = self.search_steps.saturating_add(1);
            if self.occupied_labels[label as usize] == 0
                && (self.attacked_masks[label as usize] & blockers) == 0
            {
                self.cursors[piece_type] = label + 1;
                self.max_known_label = self.max_known_label.max(label);
                return Some(label);
            }
            label += 1;
        }
        None
    }

    fn place_finite(&mut self, label: u32, piece_type: usize) {
        let coord = spiral_to_coord(label);
        self.ensure_storage(label);
        self.occupied_labels[label as usize] = piece_type as u8 + 1;
        self.piece_xs.push(coord.x);
        self.piece_ys.push(coord.y);
        self.piece_types.push(piece_type as u8);
        self.placement_count += 1;
        self.max_placed_label = self.max_placed_label.max(label);
        self.max_abs_coord = self
            .max_abs_coord
            .max(coord.x.unsigned_abs())
            .max(coord.y.unsigned_abs());

        let mask = 1u32 << piece_type;
        let finite_start = self.finite_starts[piece_type] as usize * 2;
        let finite_end = finite_start + self.finite_counts[piece_type] as usize * 2;
        for index in (finite_start..finite_end).step_by(2) {
            self.mark_label_attacked(
                coord_to_spiral(
                    coord.x + self.finite_offsets[index],
                    coord.y + self.finite_offsets[index + 1],
                ),
                mask,
            );
        }
    }

    fn find_placement(&mut self, piece_type: usize) -> Option<u32> {
        let blockers = self.attack_masks[piece_type];
        let mut label = self.cursors[piece_type];
        let safety_limit = 200_000u32.max(self.turns.saturating_mul(self.type_count as u32).saturating_mul(600));

        while label <= safety_limit {
            self.ensure_known(label);
            self.search_steps = self.search_steps.saturating_add(1);
            if self.occupied_labels[label as usize] == 0
                && (self.attacked_masks[label as usize] & blockers) == 0
            {
                self.cursors[piece_type] = label + 1;
                return Some(label);
            }
            label += 1;
        }
        None
    }

    fn place(&mut self, label: u32, piece_type: usize) {
        let coord = spiral_to_coord(label);
        self.ensure_storage(label);
        self.occupied_labels[label as usize] = piece_type as u8 + 1;
        self.piece_xs.push(coord.x);
        self.piece_ys.push(coord.y);
        self.piece_types.push(piece_type as u8);
        self.placement_count += 1;
        self.max_placed_label = self.max_placed_label.max(label);
        self.max_abs_coord = self
            .max_abs_coord
            .max(coord.x.unsigned_abs())
            .max(coord.y.unsigned_abs());

        let mask = 1u32 << piece_type;
        let finite_start = self.finite_starts[piece_type] as usize * 2;
        let finite_end = finite_start + self.finite_counts[piece_type] as usize * 2;
        for index in (finite_start..finite_end).step_by(2) {
            self.mark_attacked(
                coord.x + self.finite_offsets[index],
                coord.y + self.finite_offsets[index + 1],
                mask,
            );
        }

        let ray_start = self.ray_starts[piece_type] as usize * 2;
        let ray_end = ray_start + self.ray_counts[piece_type] as usize * 2;
        for index in (ray_start..ray_end).step_by(2) {
            let dx = self.ray_offsets[index];
            let dy = self.ray_offsets[index + 1];
            let direction_id = self.get_direction_id(dx, dy);
            self.propagate_ray_to_limit(
                RayFront {
                    x: coord.x + dx,
                    y: coord.y + dy,
                    dx,
                    dy,
                    mask,
                    direction_id,
                },
                self.max_known_label,
            );
        }
    }

    fn ensure_known(&mut self, label: u32) {
        if label <= self.max_known_label {
            return;
        }
        self.ensure_storage(label);
        while self.max_known_label < label {
            self.max_known_label += 1;
            if let Some(fronts) = self.pending_ray_fronts.remove(&self.max_known_label) {
                for front in fronts {
                    self.propagate_ray_to_limit(front, self.max_known_label);
                }
            }
        }
    }

    fn propagate_ray_to_limit(&mut self, mut front: RayFront, limit: u32) {
        let mut label = coord_to_spiral(front.x, front.y);
        let mut guard = 0u32;
        while label <= limit && guard < 1_000_000 {
            let new_mask = self.mark_ray_seen(label, front.direction_id, front.mask);
            if new_mask == 0 {
                return;
            }
            self.mark_label_attacked(label, new_mask);
            front.mask = new_mask;
            front.x += front.dx;
            front.y += front.dy;
            label = coord_to_spiral(front.x, front.y);
            guard += 1;
        }
        self.pending_ray_fronts.entry(label).or_default().push(front);
    }

    fn mark_ray_seen(&mut self, label: u32, direction_id: u32, mask: u32) -> u32 {
        let direction_index = direction_id as usize;
        while self.ray_seen_masks.len() <= direction_index {
            self.ray_seen_masks.push(Vec::new());
        }
        let label_index = label as usize;
        let seen_by_label = &mut self.ray_seen_masks[direction_index];
        if seen_by_label.len() <= label_index {
            seen_by_label.resize(label_index + 1, 0);
        }
        let seen = seen_by_label[label_index];
        let new_mask = mask & !seen;
        if new_mask != 0 {
            seen_by_label[label_index] = seen | new_mask;
        }
        new_mask
    }

    fn mark_attacked(&mut self, x: i32, y: i32, mask: u32) {
        self.mark_label_attacked(coord_to_spiral(x, y), mask);
    }

    fn mark_label_attacked(&mut self, label: u32, mask: u32) {
        self.ensure_storage(label);
        self.attacked_masks[label as usize] |= mask;
    }

    fn register_ray_directions(&mut self) {
        for piece_type in 0..self.type_count {
            let ray_start = self.ray_starts[piece_type] as usize * 2;
            let ray_end = ray_start + self.ray_counts[piece_type] as usize * 2;
            for index in (ray_start..ray_end).step_by(2) {
                self.get_direction_id(self.ray_offsets[index], self.ray_offsets[index + 1]);
            }
        }
    }

    fn get_direction_id(&mut self, dx: i32, dy: i32) -> u32 {
        if let Some(index) = self
            .direction_ids
            .iter()
            .position(|&(seen_dx, seen_dy)| seen_dx == dx && seen_dy == dy)
        {
            return index as u32;
        }
        let id = self.direction_count;
        self.direction_ids.push((dx, dy));
        self.direction_count += 1;
        id
    }

    fn ensure_storage(&mut self, label: u32) {
        let label = label as usize;
        if label < self.attacked_masks.len() {
            return;
        }
        let mut next_len = self.attacked_masks.len();
        while next_len <= label {
            next_len *= 2;
        }
        self.attacked_masks.resize(next_len, 0);
        self.occupied_labels.resize(next_len, 0);
    }
}

fn spiral_to_coord(n: u32) -> Coord {
    if n == 0 {
        return Coord { x: 0, y: 0 };
    }
    let ring = ((((n + 1) as f64).sqrt() - 1.0) / 2.0).ceil() as i32;
    let side = ring * 2;
    let max = (side + 1) * (side + 1) - 1;
    let offset = max - n as i32;

    if offset < side {
        Coord {
            x: ring - offset,
            y: -ring,
        }
    } else if offset < side * 2 {
        Coord {
            x: -ring,
            y: -ring + (offset - side),
        }
    } else if offset < side * 3 {
        Coord {
            x: -ring + (offset - side * 2),
            y: ring,
        }
    } else {
        Coord {
            x: ring,
            y: ring - (offset - side * 3),
        }
    }
}

fn coord_to_spiral(x: i32, y: i32) -> u32 {
    if x == 0 && y == 0 {
        return 0;
    }
    let ring = x.abs().max(y.abs());
    let side = ring * 2;
    let max = (side + 1) * (side + 1) - 1;
    let label = if y == -ring {
        max - (ring - x)
    } else if x == -ring {
        max - side - (y + ring)
    } else if y == ring {
        max - side * 2 - (x + ring)
    } else {
        max - side * 3 - (ring - y)
    };
    label as u32
}

macro_rules! result_getter {
    ($name:ident, $field:ident, $ty:ty) => {
        #[no_mangle]
        pub unsafe extern "C" fn $name() -> $ty {
            RESULT.as_ref().map(|result| result.$field as $ty).unwrap_or(0 as $ty)
        }
    };
}

result_getter!(result_placement_count, placement_count, u32);
result_getter!(result_max_known_label, max_known_label, u32);
result_getter!(result_max_placed_label, max_placed_label, u32);
result_getter!(result_max_abs_coord, max_abs_coord, u32);
result_getter!(result_search_steps, search_steps, u32);
result_getter!(result_warning_code, warning_code, u32);

#[no_mangle]
pub unsafe extern "C" fn result_piece_xs_ptr() -> *const i32 {
    RESULT
        .as_ref()
        .map(|result| result.piece_xs.as_ptr())
        .unwrap_or(std::ptr::null())
}

#[no_mangle]
pub unsafe extern "C" fn result_piece_ys_ptr() -> *const i32 {
    RESULT
        .as_ref()
        .map(|result| result.piece_ys.as_ptr())
        .unwrap_or(std::ptr::null())
}

#[no_mangle]
pub unsafe extern "C" fn result_piece_types_ptr() -> *const u8 {
    RESULT
        .as_ref()
        .map(|result| result.piece_types.as_ptr())
        .unwrap_or(std::ptr::null())
}

#[no_mangle]
pub unsafe extern "C" fn result_attacked_masks_ptr() -> *const u32 {
    RESULT
        .as_ref()
        .map(|result| result.attacked_masks.as_ptr())
        .unwrap_or(std::ptr::null())
}

#[no_mangle]
pub unsafe extern "C" fn result_attacked_masks_len() -> u32 {
    RESULT
        .as_ref()
        .map(|result| result.attacked_masks.len() as u32)
        .unwrap_or(0)
}
