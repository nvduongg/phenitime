import pandas as pd
from collections import defaultdict

from ortools.sat.python import cp_model

from algorithms.learning_modes import LEARNING_MODES, get_learning_mode, normalize_learning_type


class TimetableScheduler:
    """
    Timetable scheduler using Google OR-Tools CP-SAT.

    Time grid:
    - Days 2–7: Monday through Saturday (Thứ 2 – Thứ 7). Sunday (day 8) excluded.
    - Shifts (ca anchors): [1, 4, 7, 10, 13] — each block spans shift_duration periods.

    Virtual classes (ELN, ĐA, TT): evening shift anchors only, ONLINE_VIRTUAL room.
    """

    VIRTUAL_ROOM_ID = "ONLINE_VIRTUAL"
    CANONICAL_SHIFTS = [1, 4, 7, 10, 13]
    FALLBACK_EVENING_STARTS = [13]
    FALLBACK_ALLOWED_DAYS = list(range(2, 8))
    FALLBACK_SHIFT_DURATION = 3
    MAX_SHIFTS_PER_DAY_LECTURER = 2
    DEFAULT_SOLVER_MAX_TIME_SECONDS = 60.0
    DEFAULT_SOLVER_NUM_WORKERS = 8
    DEFAULT_RELAXATION_MAX_TIME_SECONDS = 60.0
    DEFAULT_LNS_MAX_ITERATIONS = 3
    DEFAULT_LNS_MAX_NEIGHBORHOOD = 40
    DEFAULT_LNS_MAX_TIME_SECONDS = 90.0
    SOFT_CAPACITY_RATIO = 0.9
    RELAXED_MAX_SHIFTS_PER_DAY = 3
    REWARD_SCHEDULED = 1000
    PENALTY_OVERCROWDED = 10
    PENALTY_FATIGUED = 20
    PENALTY_CRAMMED = 15
    REASON_OVERCROWDED = "Overcrowded Room"
    REASON_FATIGUED = "Lecturer Overloaded"
    REASON_CRAMMED = "Section Crammed"
    REASON_LNS = "LNS local repair"

    PRACTICE_ROOM_TYPES = LEARNING_MODES["PRACTICE"]
    THEORY_ROOM_TYPES = LEARNING_MODES["THEORY"]

    THEORY_GROUP = frozenset({"LT", "STD", "STANDARD", ""})
    COMPUTER_LAB_GROUP = frozenset({"PC", "PM", "LAB"})
    MEDICAL_GROUP = frozenset({"MED", "BV", "VJ"})

    def __init__(self, df_events, df_rooms, config=None):
        self.events = df_events
        self.rooms = df_rooms.copy()
        config = config or {}
        self.config = config

        allowed_days = config.get("allowed_days", self.FALLBACK_ALLOWED_DAYS)
        parsed_days = sorted(
            {
                int(day)
                for day in allowed_days
                if isinstance(day, (int, float)) and 2 <= int(day) <= 7
            }
        )
        self.days = parsed_days or list(self.FALLBACK_ALLOWED_DAYS)

        self.allowed_start_periods = config.get(
            "allowed_start_periods",
            config.get("regular_starts", self.CANONICAL_SHIFTS),
        )
        self.evening_start_periods = config.get(
            "evening_starts", self.FALLBACK_EVENING_STARTS
        )
        self.session_block_size = max(
            int(config.get("shift_duration", self.FALLBACK_SHIFT_DURATION)),
            1,
        )
        self.max_period = max(int(config.get("max_period", 15)), 1)
        self.max_lecturer_shifts_per_day = max(
            int(
                config.get(
                    "max_lecturer_shifts_per_day",
                    self.MAX_SHIFTS_PER_DAY_LECTURER,
                )
            ),
            1,
        )

        configured_shifts = [
            int(shift)
            for shift in self.allowed_start_periods
            if int(shift) in self.CANONICAL_SHIFTS
        ]
        self.shifts = configured_shifts or list(self.CANONICAL_SHIFTS)

        self.physical_shifts = [
            shift for shift in self.shifts if shift in self.allowed_start_periods
        ] or list(self.shifts)
        self.virtual_shifts = [
            int(shift)
            for shift in self.evening_start_periods
            if int(shift) in self.shifts
        ] or [shift for shift in self.shifts if shift == 13]

        self.virtual_class_types = [
            "ELN",
            "ĐA",
            "TT",
            "ONLINE_ELEARNING",
            "ONLINE_COURSERA",
        ]

        self._ensure_virtual_room()

        self.model = cp_model.CpModel()
        self.X = {}
        self.is_scheduled = {}
        self.Unscheduled = {}
        self.timetable = []
        self.unscheduled_classes = []
        self.section_groups = {}
        self.lecturer_groups = {}
        self.student_group_map = {}

        self._room_period_index = defaultdict(list)
        self._lecturer_period_index = defaultdict(list)
        self._group_period_index = defaultdict(list)
        self._section_day_index = defaultdict(list)
        self._lecturer_day_index = defaultdict(list)
        self.duration_by_event = {}
        self.event_week_window = {}
        self.existing_occupancy = config.get("existing_occupancy") or []
        self.fixed_room_per_section = config.get("fixed_room_per_section", True)
        self._occupancy_period_index = defaultdict(list)
        self._build_occupancy_period_index()

        if self.existing_occupancy:
            print(
                f"[*] Loaded {len(self.existing_occupancy)} existing occupancy block(s) "
                f"from prior wave timetables."
            )

    @staticmethod
    def _safe_int(value, default=0):
        try:
            if pd.isna(value):
                return default
            return int(float(value))
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _normalize_room_type(value):
        return str(value or "").strip().upper()

    @staticmethod
    def is_compatible(r_type, req):
        r_type = str(r_type).strip().upper()
        req = str(req).strip().upper()

        if req == "ONLINE":
            return r_type in {"ONLINE", "VIRTUAL"}
        if r_type in {"ONLINE", "VIRTUAL"}:
            return req == "ONLINE"
        if req in TimetableScheduler.THEORY_GROUP and r_type in TimetableScheduler.THEORY_GROUP:
            return True
        if req in TimetableScheduler.COMPUTER_LAB_GROUP:
            return r_type in TimetableScheduler.COMPUTER_LAB_GROUP
        if req == "MED":
            return r_type in TimetableScheduler.MEDICAL_GROUP
        return r_type == req

    def _ensure_virtual_room(self):
        room_ids = set(self.rooms["room_id"].astype(str))
        if self.VIRTUAL_ROOM_ID not in room_ids:
            virtual_room = pd.DataFrame(
                [{
                    "room_id": self.VIRTUAL_ROOM_ID,
                    "capacity": 9999,
                    "room_type": "ONLINE",
                }]
            )
            self.rooms = pd.concat([self.rooms, virtual_room], ignore_index=True)

    def _is_virtual_event(self, event):
        return event["class_type"] in self.virtual_class_types

    def _is_online_event(self, event):
        required_raw = event.get("room_type_req")
        if pd.isna(required_raw) or required_raw is None or str(required_raw).strip() == "":
            return self._is_virtual_event(event)
        return str(required_raw).upper() == "ONLINE"

    def _uses_virtual_room(self, event):
        return self._is_online_event(event) or self._is_virtual_event(event)

    def _allowed_room_types_for_event(self, event):
        required_raw = event.get("room_type_req")
        if not pd.isna(required_raw) and required_raw is not None and str(required_raw).strip():
            required = normalize_learning_type(required_raw)
            if required == "ONLINE":
                return frozenset({self.VIRTUAL_ROOM_ID})
            if required in self.PRACTICE_ROOM_TYPES:
                return frozenset({required})
            if required in self.THEORY_ROOM_TYPES:
                return self.THEORY_ROOM_TYPES

        class_type = normalize_learning_type(event.get("class_type"))
        mode = get_learning_mode(class_type)
        if mode == "PRACTICE":
            return self.PRACTICE_ROOM_TYPES
        return self.THEORY_ROOM_TYPES

    def _room_matches_event_type(self, event, room):
        if self._uses_virtual_room(event):
            return str(room["room_id"]) == self.VIRTUAL_ROOM_ID

        room_type = room.get("room_type", "")
        required_raw = event.get("room_type_req")
        if pd.isna(required_raw) or required_raw is None or str(required_raw).strip() == "":
            required_raw = event.get("class_type") or "LT"

        if self._normalize_room_type(room_type) in {"ONLINE", "VIRTUAL"}:
            return self._normalize_room_type(required_raw) == "ONLINE"

        return self.is_compatible(room_type, required_raw)

    def _passes_capacity_and_room_type_pruning(self, event, room):
        if self._uses_virtual_room(event):
            return str(room.get("room_id")) == self.VIRTUAL_ROOM_ID

        room_cap = self._safe_int(room.get("capacity", 0), 0)
        event_cap = self._safe_int(event.get("capacity", 0), 0)
        if room_cap < event_cap:
            return False

        room_type = room.get("room_type", "")
        event_type_req = event.get("room_type_req", "")
        if pd.isna(event_type_req) or event_type_req is None:
            event_type_req = ""

        if self._normalize_room_type(room_type) in {"ONLINE", "VIRTUAL"}:
            return self._normalize_room_type(event_type_req) == "ONLINE"

        return self.is_compatible(room_type, event_type_req)

    def _passes_soft_capacity_pruning(self, event, room):
        """Phase 2: allow rooms with capacity >= 90% of enrollment."""
        if self._uses_virtual_room(event):
            return str(room.get("room_id")) == self.VIRTUAL_ROOM_ID

        room_cap = self._safe_int(room.get("capacity", 0), 0)
        event_cap = self._safe_int(event.get("capacity", 0), 0)
        if event_cap <= 0:
            return True

        min_room_cap = int(event_cap * self.SOFT_CAPACITY_RATIO)
        if room_cap < min_room_cap:
            return False

        room_type = room.get("room_type", "")
        event_type_req = event.get("room_type_req", "")
        if pd.isna(event_type_req) or event_type_req is None:
            event_type_req = ""

        if self._normalize_room_type(room_type) in {"ONLINE", "VIRTUAL"}:
            return self._normalize_room_type(event_type_req) == "ONLINE"

        return self.is_compatible(room_type, event_type_req)

    def _is_overcrowded_placement(self, event, room):
        if self._uses_virtual_room(event):
            return False

        room_cap = self._safe_int(room.get("capacity", 0), 0)
        event_cap = self._safe_int(event.get("capacity", 0), 0)
        if event_cap <= 0:
            return False

        min_room_cap = int(event_cap * self.SOFT_CAPACITY_RATIO)
        return min_room_cap <= room_cap < event_cap

    def _fits_shift(self, event, shift):
        duration = self._safe_int(event.get("duration"), self.session_block_size)
        return shift + duration - 1 <= self.max_period

    def _allowed_start_shifts(self, event):
        duration = self._safe_int(event.get("duration"), self.session_block_size)
        if self._uses_virtual_room(event):
            anchors = self.virtual_shifts
        else:
            anchors = self.physical_shifts

        if duration <= self.session_block_size:
            return [shift for shift in anchors if self._fits_shift(event, shift)]

        return [
            shift
            for shift in anchors
            if shift + duration - 1 <= self.max_period
        ]

    def _is_valid_shift(self, event, shift):
        return shift in self._allowed_start_shifts(event)

    @staticmethod
    def _occupied_periods(start_shift, duration, max_period=15):
        end_period = start_shift + duration - 1
        return list(range(start_shift, min(end_period, max_period) + 1))

    @staticmethod
    def _resolve_week_window(event):
        week_from = event.get("week_from")
        week_to = event.get("week_to")
        try:
            start = int(week_from)
            end = int(week_to)
            if start > 0 and end >= start:
                return start, end
        except (TypeError, ValueError):
            pass
        return 1, 99

    @staticmethod
    def _week_windows_overlap(w1_from, w1_to, w2_from, w2_to):
        return w1_from <= w2_to and w2_from <= w1_to

    @staticmethod
    def _period_ranges_overlap(start_a, count_a, start_b, count_b):
        end_a = start_a + count_a - 1
        end_b = start_b + count_b - 1
        return start_a <= end_b and start_b <= end_a

    def _build_occupancy_period_index(self):
        self._occupancy_period_index = defaultdict(list)

        for block in self.existing_occupancy:
            if not isinstance(block, dict):
                continue

            room_id = str(block.get("room_id") or "").strip()
            day = self._safe_int(block.get("day_of_week"), 0)
            start_period = self._safe_int(block.get("start_period"), 0)
            period_count = max(self._safe_int(block.get("period_count"), 3), 1)
            week_from = max(self._safe_int(block.get("week_from"), 1), 1)
            week_to = max(self._safe_int(block.get("week_to"), week_from), week_from)

            if not room_id or day < 2 or day > 7 or start_period <= 0:
                continue

            occupied = self._occupied_periods(
                start_period,
                period_count,
                self.max_period,
            )
            payload = {
                "room_id": room_id,
                "day": day,
                "week_from": week_from,
                "week_to": week_to,
            }
            for period in occupied:
                self._occupancy_period_index[(room_id, day, period)].append(payload)

    def _blocked_by_existing_occupancy(self, event, room_id, day, shift):
        if not self._occupancy_period_index:
            return False

        week_from, week_to = self._resolve_week_window(event)
        duration = self._safe_int(event.get("duration"), self.session_block_size)
        occupied = self._occupied_periods(shift, duration, self.max_period)

        seen_blocks = set()
        for period in occupied:
            for block in self._occupancy_period_index.get((str(room_id), day, period), []):
                block_key = (
                    block["room_id"],
                    block["day"],
                    block["week_from"],
                    block["week_to"],
                )
                if block_key in seen_blocks:
                    continue
                seen_blocks.add(block_key)
                if self._week_windows_overlap(
                    week_from,
                    week_to,
                    block["week_from"],
                    block["week_to"],
                ):
                    return True

        return False

    def _should_create_variable(self, event, room, day, shift):
        room_id = str(room["room_id"])

        if not self._passes_capacity_and_room_type_pruning(event, room):
            return False

        if not self._room_matches_event_type(event, room):
            return False

        if not self._fits_shift(event, shift):
            return False

        if not self._is_valid_shift(event, shift):
            return False

        is_virtual = self._uses_virtual_room(event)
        if is_virtual:
            return room_id == self.VIRTUAL_ROOM_ID
        return room_id != self.VIRTUAL_ROOM_ID

    def _sanitize_var_token(self, value):
        return str(value).replace(" ", "_").replace("/", "_")

    def _index_placement_var(self, event, room_id, day, start_shift, var):
        duration = self._safe_int(event.get("duration"), self.session_block_size)
        occupied_periods = self._occupied_periods(
            start_shift,
            duration,
            self.max_period,
        )

        lecturer_id = event.get("lecturer_id")
        if not pd.isna(lecturer_id) and str(lecturer_id).strip():
            lecturer_key = str(lecturer_id).strip()
            self._lecturer_day_index[(lecturer_key, day)].append(var)
            for period in occupied_periods:
                self._lecturer_period_index[(lecturer_key, day, period)].append(var)

        student_groups = event.get("student_groups") or []
        if isinstance(student_groups, list):
            for group_id in student_groups:
                if group_id:
                    for period in occupied_periods:
                        self._group_period_index[(str(group_id), day, period)].append(var)

        section_id = event.get("section_id")
        if section_id:
            week_from, week_to = self._resolve_week_window(event)
            self._section_day_index[(str(section_id), day, week_from, week_to)].append(var)

        if str(room_id) != self.VIRTUAL_ROOM_ID:
            for period in occupied_periods:
                self._room_period_index[(str(room_id), day, period)].append(var)

    def build_model(self):
        print("[*] Building CP-SAT decision variables with room/event pruning...")

        print(f"[*] DEBUG: Received {len(self.events)} events and {len(self.rooms)} rooms.")
        if len(self.rooms) > 0:
            print(f"[*] DEBUG Sample Room: {self.rooms.iloc[0].to_dict()}")
        if len(self.events) > 0:
            print(f"[*] DEBUG Sample Event: {self.events.iloc[0].to_dict()}")

        events_without_slots = []
        stats = {
            "capacity": 0,
            "room_type": 0,
            "shift_fit": 0,
            "invalid_shift": 0,
            "virtual_filter": 0,
            "existing_occupancy": 0,
        }

        for _, event in self.events.iterrows():
            event_id = str(event["event_id"])
            event_var_count = 0
            duration = self._safe_int(event.get("duration"), self.session_block_size)
            self.duration_by_event[event_id] = duration
            self.event_week_window[event_id] = self._resolve_week_window(event)
            is_virtual = self._uses_virtual_room(event)

            is_sched_var = self.model.NewBoolVar(f"is_sched_{self._sanitize_var_token(event_id)}")
            self.is_scheduled[event_id] = is_sched_var
            event_vars = []

            shift_candidates = self._allowed_start_shifts(event)

            for _, room in self.rooms.iterrows():
                room_id = str(room["room_id"])

                if is_virtual and room_id != self.VIRTUAL_ROOM_ID:
                    stats["virtual_filter"] += 1
                    continue
                if not is_virtual and room_id == self.VIRTUAL_ROOM_ID:
                    stats["virtual_filter"] += 1
                    continue

                if not self._passes_capacity_and_room_type_pruning(event, room):
                    stats["room_type"] += 1
                    continue

                for day in self.days:
                    for shift in shift_candidates:
                        if not self._fits_shift(event, shift):
                            stats["shift_fit"] += 1
                            continue

                        if not self._is_valid_shift(event, shift):
                            stats["invalid_shift"] += 1
                            continue

                        if not self._should_create_variable(event, room, day, shift):
                            continue

                        if self._blocked_by_existing_occupancy(event, room_id, day, shift):
                            stats["existing_occupancy"] += 1
                            continue

                        var_name = (
                            f"x_{self._sanitize_var_token(event_id)}_"
                            f"{self._sanitize_var_token(room_id)}_d{day}_s{shift}"
                        )
                        var = self.model.NewBoolVar(var_name)
                        self.X[(event_id, room_id, day, shift)] = var
                        event_vars.append(var)
                        event_var_count += 1
                        self._index_placement_var(event, room_id, day, shift, var)

            if event_var_count == 0:
                events_without_slots.append(event_id)
                required = event.get("room_type_req")
                if pd.isna(required) or required is None or str(required).strip() == "":
                    required = ", ".join(sorted(self._allowed_room_types_for_event(event)))
                else:
                    required = str(required).upper()
                print(
                    f"WARNING: Event [{event_id}] has NO valid slots "
                    f"(check capacity/type; required room type: {required}). "
                    f"Will remain unscheduled."
                )
                self.model.Add(is_sched_var == 0)
            else:
                self.model.Add(sum(event_vars) == is_sched_var)

            if event_var_count == 0:
                continue

        self.Unscheduled = self.is_scheduled

        if events_without_slots:
            print(
                f"[!] {len(events_without_slots)} event(s) have zero valid "
                f"placement options after pruning."
            )

        print(
            "[*] DEBUG Pruning Rejections -> "
            f"Type/Capacity: {stats['room_type']}, Virtual filter: {stats['virtual_filter']}"
        )
        print(
            "[*] DEBUG Pruning Rejections (other) -> "
            f"Shift fit: {stats['shift_fit']}, Invalid shift: {stats['invalid_shift']}, "
            f"Existing occupancy: {stats['existing_occupancy']}"
        )
        print(
            f"[*] Created {len(self.X)} placement variables and "
            f"{len(self.is_scheduled)} schedule indicators after pruning."
        )

        self.section_groups = {}
        for _, event in self.events.iterrows():
            sec_id = event.get("section_id")
            if sec_id:
                self.section_groups.setdefault(str(sec_id), []).append(str(event["event_id"]))

        multi_session_sections = sum(
            1 for part_ids in self.section_groups.values() if len(part_ids) > 1
        )
        print(
            f"[*] Grouped events into {len(self.section_groups)} sections; "
            f"{multi_session_sections} with multiple phase/session parts (HC6 scoped by week window)."
        )

        self.lecturer_groups = {}
        for _, event in self.events.iterrows():
            lecturer_id = event.get("lecturer_id")
            if pd.isna(lecturer_id) or not str(lecturer_id).strip():
                continue
            lecturer_key = str(lecturer_id).strip()
            self.lecturer_groups.setdefault(lecturer_key, []).append(str(event["event_id"]))

        self.student_group_map = {}
        for _, event in self.events.iterrows():
            event_id = str(event["event_id"])
            for group_id in event.get("student_groups") or []:
                if group_id:
                    self.student_group_map.setdefault(str(group_id), []).append(event_id)

        print(
            f"[*] Grouped events into {len(self.lecturer_groups)} lecturers "
            f"(HC7 max {self.max_lecturer_shifts_per_day} shifts/day)."
        )
        print(f"[*] Grouped events into {len(self.student_group_map)} student groups (HC4).")

        return self.X

    def add_hard_constraints(self):
        print("[*] Loading hard constraints (CP-SAT)...")

        hc2_count = 0
        for (room_id, day, period), vars_at_period in self._room_period_index.items():
            if len(vars_at_period) > 1:
                self.model.AddAtMostOne(vars_at_period)
                hc2_count += 1

        hc3_count = 0
        for (_lecturer_id, day, period), vars_at_period in self._lecturer_period_index.items():
            if len(vars_at_period) > 1:
                self.model.AddAtMostOne(vars_at_period)
                hc3_count += 1

        hc4_count = 0
        for (_group_id, day, period), vars_at_period in self._group_period_index.items():
            if len(vars_at_period) > 1:
                self.model.AddAtMostOne(vars_at_period)
                hc4_count += 1

        hc6_count = 0
        for (_section_id, day, _week_from, _week_to), vars_on_day in self._section_day_index.items():
            if len(vars_on_day) > 1:
                self.model.Add(sum(vars_on_day) <= 1)
                hc6_count += 1

        hc7_count = 0
        max_shifts_per_day = self.max_lecturer_shifts_per_day
        for (_lecturer_id, day), vars_on_day in self._lecturer_day_index.items():
            if len(vars_on_day) > max_shifts_per_day:
                self.model.Add(sum(vars_on_day) <= max_shifts_per_day)
                hc7_count += 1

        hc8_count = self._add_fixed_room_per_section_constraints()

        self.model.Maximize(sum(self.is_scheduled.values()))

        print(f"[*] HC2 room shift conflicts (AddAtMostOne): {hc2_count}")
        print(f"[*] HC3 lecturer shift conflicts (AddAtMostOne): {hc3_count}")
        print(f"[*] HC4 student group shift conflicts (AddAtMostOne): {hc4_count}")
        print(
            f"[*] HC6 day-separation constraints: {hc6_count} "
            f"(overlapping week windows cannot share the same weekday)."
        )
        print(
            f"[*] HC7 lecturer fatigue constraints: {hc7_count} "
            f"(max {max_shifts_per_day} shifts/day per lecturer)."
        )
        print(
            f"[*] HC8 fixed room per section constraints: {hc8_count} "
            f"(all sessions of a section share one physical room)."
        )
        print("[*] Objective: maximize scheduled events (CP-SAT Maximize).")

    def _add_fixed_room_per_section_constraints(self):
        if not self.fixed_room_per_section:
            return 0

        hc8_count = 0
        events_index = self.events.set_index("event_id", drop=False)

        for section_id, event_ids in self.section_groups.items():
            if len(event_ids) < 2:
                continue

            physical_event_ids = []
            for event_id in event_ids:
                if event_id not in events_index.index:
                    continue
                event_row = events_index.loc[event_id]
                if isinstance(event_row, pd.DataFrame):
                    event_row = event_row.iloc[0]
                if not self._uses_virtual_room(event_row):
                    physical_event_ids.append(event_id)

            if len(physical_event_ids) < 2:
                continue

            candidate_rooms = sorted({
                key[1]
                for key in self.X
                if key[0] in physical_event_ids
            })
            if not candidate_rooms:
                continue

            home_vars = {}
            for room_id in candidate_rooms:
                token = (
                    f"{self._sanitize_var_token(section_id)}_"
                    f"{self._sanitize_var_token(room_id)}"
                )
                home_vars[room_id] = self.model.NewBoolVar(f"home_{token}")

            self.model.Add(sum(home_vars.values()) <= 1)
            hc8_count += 1

            for room_id, home_var in home_vars.items():
                for event_id in physical_event_ids:
                    for key, placement_var in self.X.items():
                        if key[0] == event_id and key[1] == room_id:
                            self.model.Add(placement_var <= home_var)

        return hc8_count

    def _build_unscheduled_classes(self, unscheduled_event_ids):
        events_index = self.events.set_index("event_id")
        unscheduled_classes = []

        for event_id in unscheduled_event_ids:
            if event_id not in events_index.index:
                unscheduled_classes.append(
                    {"event_id": event_id, "section_id": event_id},
                )
                continue

            event_row = events_index.loc[event_id]
            if isinstance(event_row, pd.DataFrame):
                event_row = event_row.iloc[0]

            unscheduled_classes.append(
                {
                    "event_id": event_id,
                    "section_id": event_row.get("section_id", event_id),
                    "class_type": event_row.get("class_type"),
                }
            )

        return unscheduled_classes

    def _solver_status_label(self, status):
        if status == cp_model.OPTIMAL:
            return "OPTIMAL"
        if status == cp_model.FEASIBLE:
            return "FEASIBLE"
        if status == cp_model.INFEASIBLE:
            return "INFEASIBLE"
        if status == cp_model.MODEL_INVALID:
            return "MODEL_INVALID"
        return "UNKNOWN"

    def _create_solver(self, max_time=None):
        max_time = float(
            max_time
            if max_time is not None
            else self.config.get("solver_max_time_seconds", self.DEFAULT_SOLVER_MAX_TIME_SECONDS)
        )
        num_workers = int(
            self.config.get("solver_num_workers", self.DEFAULT_SOLVER_NUM_WORKERS)
        )

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = max_time
        solver.parameters.num_search_workers = num_workers
        solver.parameters.log_search_progress = bool(
            self.config.get("solver_log_search_progress", False)
        )
        return solver, max_time, num_workers

    def _extract_placement_rows(self, solver, placement_vars, extra_fields=None):
        extra_fields = extra_fields or {}
        results = []

        for key, var in placement_vars.items():
            if not solver.BooleanValue(var):
                continue

            event_id, room_id, day, shift = key
            period_count = self.duration_by_event.get(
                event_id,
                self.session_block_size,
            )
            row = {
                "event_id": event_id,
                "room_id": room_id,
                "day": day,
                "start_period": shift,
                "period_count": period_count,
                "is_relaxed": extra_fields.get("is_relaxed", False),
            }
            if extra_fields.get("relaxation_reason"):
                row["relaxation_reason"] = extra_fields["relaxation_reason"]
            results.append(row)

        return results

    def _run_phase1_solver(self):
        solver, max_time, num_workers = self._create_solver()

        print(
            f"[*] Phase 1 (strict): running CP-SAT "
            f"(max_time={max_time}s, workers={num_workers})..."
        )

        status = solver.Solve(self.model)
        status_label = self._solver_status_label(status)
        print(f"[*] Phase 1 status: {status_label}")
        print(
            f"[*] Phase 1 objective: "
            f"{solver.ObjectiveValue() if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else 'n/a'}, "
            f"wall_time={solver.WallTime():.2f}s"
        )

        all_event_ids = list(self.is_scheduled.keys())

        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return {
                "scheduled": [],
                "unscheduled": all_event_ids,
            }

        unscheduled = [
            event_id
            for event_id, var in self.is_scheduled.items()
            if not solver.BooleanValue(var)
        ]

        results = self._extract_placement_rows(
            solver,
            self.X,
            extra_fields={"is_relaxed": False},
        )

        if unscheduled:
            print(
                f"[!] Phase 1: {len(unscheduled)} event(s) unscheduled "
                f"within {max_time}s."
            )

        print(
            f"[*] Phase 1: scheduled {len(results)} placement(s) for "
            f"{len(self.is_scheduled) - len(unscheduled)} event(s)."
        )

        return {
            "scheduled": results,
            "unscheduled": unscheduled,
        }

    def _build_base_occupancy_maps(self, base_timetable):
        events_index = self.events.set_index("event_id", drop=False)

        room_period_occ = defaultdict(int)
        lecturer_period_occ = defaultdict(int)
        group_period_occ = defaultdict(int)
        section_day_occ = defaultdict(int)
        lecturer_day_occ = defaultdict(int)

        for row in base_timetable:
            event_id = str(row["event_id"])
            room_id = str(row["room_id"])
            day = int(row["day"])
            shift = int(row["start_period"])
            duration = int(
                row.get("period_count")
                or self.duration_by_event.get(event_id, self.session_block_size)
            )
            occupied_periods = self._occupied_periods(shift, duration, self.max_period)

            if room_id != self.VIRTUAL_ROOM_ID:
                for period in occupied_periods:
                    room_period_occ[(room_id, day, period)] += 1

            if event_id not in events_index.index:
                continue

            event_row = events_index.loc[event_id]
            if isinstance(event_row, pd.DataFrame):
                event_row = event_row.iloc[0]

            lecturer_id = event_row.get("lecturer_id")
            if not pd.isna(lecturer_id) and str(lecturer_id).strip():
                lecturer_key = str(lecturer_id).strip()
                for period in occupied_periods:
                    lecturer_period_occ[(lecturer_key, day, period)] += 1
                lecturer_day_occ[(lecturer_key, day)] += 1

            for group_id in event_row.get("student_groups") or []:
                if group_id:
                    for period in occupied_periods:
                        group_period_occ[(str(group_id), day, period)] += 1

            section_id = event_row.get("section_id")
            if section_id:
                week_from, week_to = self._resolve_week_window(event_row)
                section_day_occ[(str(section_id), day, week_from, week_to)] += 1

        return {
            "room_period": room_period_occ,
            "lecturer_period": lecturer_period_occ,
            "group_period": group_period_occ,
            "section_day": section_day_occ,
            "lecturer_day": lecturer_day_occ,
        }

    def _compose_relaxation_reason(self, overcrowded, fatigued, crammed, base_reason=None):
        reasons = []
        if base_reason:
            reasons.append(base_reason)
        if overcrowded:
            reasons.append(self.REASON_OVERCROWDED)
        if fatigued:
            reasons.append(self.REASON_FATIGUED)
        if crammed:
            reasons.append(self.REASON_CRAMMED)
        return " | ".join(reasons) if reasons else None

    def _expand_lns_neighborhood(self, seed_unscheduled, schedule_rows):
        max_size = max(int(self.config.get("lns_max_neighborhood", self.DEFAULT_LNS_MAX_NEIGHBORHOOD)), 1)
        seed = {str(event_id) for event_id in seed_unscheduled}
        if not seed:
            return []

        events_index = self.events.set_index("event_id", drop=False)
        neighborhood = set(seed)

        by_lecturer = defaultdict(set)
        by_section = defaultdict(set)
        by_group = defaultdict(set)

        for row in schedule_rows:
            event_id = str(row.get("event_id"))
            if event_id in seed or event_id not in events_index.index:
                continue

            event_row = events_index.loc[event_id]
            if isinstance(event_row, pd.DataFrame):
                event_row = event_row.iloc[0]

            section_id = event_row.get("section_id")
            if section_id:
                by_section[str(section_id)].add(event_id)

            lecturer_id = event_row.get("lecturer_id")
            if not pd.isna(lecturer_id) and str(lecturer_id).strip():
                by_lecturer[str(lecturer_id).strip()].add(event_id)

            for group_id in event_row.get("student_groups") or []:
                if group_id:
                    by_group[str(group_id)].add(event_id)

        for event_id in list(seed):
            if event_id not in events_index.index:
                continue

            event_row = events_index.loc[event_id]
            if isinstance(event_row, pd.DataFrame):
                event_row = event_row.iloc[0]

            section_id = event_row.get("section_id")
            if section_id:
                neighborhood.update(by_section.get(str(section_id), set()))

            lecturer_id = event_row.get("lecturer_id")
            if not pd.isna(lecturer_id) and str(lecturer_id).strip():
                neighborhood.update(by_lecturer.get(str(lecturer_id).strip(), set()))

            for group_id in event_row.get("student_groups") or []:
                if group_id:
                    neighborhood.update(by_group.get(str(group_id), set()))

        if len(neighborhood) <= max_size:
            return list(neighborhood)

        extras = sorted(neighborhood - seed)
        seed_sections = set()
        seed_lecturers = set()
        seed_groups = set()

        for event_id in seed:
            if event_id not in events_index.index:
                continue
            event_row = events_index.loc[event_id]
            if isinstance(event_row, pd.DataFrame):
                event_row = event_row.iloc[0]
            if event_row.get("section_id"):
                seed_sections.add(str(event_row.get("section_id")))
            lecturer_id = event_row.get("lecturer_id")
            if not pd.isna(lecturer_id) and str(lecturer_id).strip():
                seed_lecturers.add(str(lecturer_id).strip())
            for group_id in event_row.get("student_groups") or []:
                if group_id:
                    seed_groups.add(str(group_id))

        scored = []
        for event_id in extras:
            if event_id not in events_index.index:
                continue
            event_row = events_index.loc[event_id]
            if isinstance(event_row, pd.DataFrame):
                event_row = event_row.iloc[0]

            score = 0
            if event_row.get("section_id") and str(event_row.get("section_id")) in seed_sections:
                score += 3
            lecturer_id = event_row.get("lecturer_id")
            if (
                not pd.isna(lecturer_id)
                and str(lecturer_id).strip() in seed_lecturers
            ):
                score += 2
            for group_id in event_row.get("student_groups") or []:
                if group_id and str(group_id) in seed_groups:
                    score += 1
            scored.append((score, event_id))

        scored.sort(key=lambda item: (-item[0], item[1]))
        trimmed = set(seed)
        for _score, event_id in scored:
            trimmed.add(event_id)
            if len(trimmed) >= max_size:
                break

        return list(trimmed)

    def _run_soft_placement_pass(
        self,
        target_event_ids,
        frozen_timetable,
        log_prefix="Phase 2",
        base_relaxation_reason=None,
        max_time_seconds=None,
    ):
        target_ids = [str(event_id) for event_id in target_event_ids]
        if not target_ids:
            return {"scheduled": [], "unscheduled": []}

        print(
            f"[*] {log_prefix}: solving {len(target_ids)} event(s) with "
            f"{len(frozen_timetable)} fixed placement(s)..."
        )

        df_leftover = self.events[self.events["event_id"].astype(str).isin(target_ids)].copy()
        if df_leftover.empty:
            print(f"[!] {log_prefix}: no matching rows in event dataframe.")
            return {"scheduled": [], "unscheduled": target_ids}

        base_maps = self._build_base_occupancy_maps(frozen_timetable)
        model2 = cp_model.CpModel()
        X2 = {}
        is_scheduled2 = {}
        placement_meta = {}

        room_period_index = defaultdict(list)
        lecturer_period_index = defaultdict(list)
        group_period_index = defaultdict(list)
        section_day_index = defaultdict(list)
        lecturer_day_index = defaultdict(list)
        event_tight_vars = defaultdict(list)

        events_without_slots = []

        for _, event in df_leftover.iterrows():
            event_id = str(event["event_id"])
            is_virtual = self._uses_virtual_room(event)
            is_sched_var = model2.NewBoolVar(f"p2_is_sched_{self._sanitize_var_token(event_id)}")
            is_scheduled2[event_id] = is_sched_var
            event_vars = []

            shift_candidates = self._allowed_start_shifts(event)

            for _, room in self.rooms.iterrows():
                room_id = str(room["room_id"])

                if is_virtual and room_id != self.VIRTUAL_ROOM_ID:
                    continue
                if not is_virtual and room_id == self.VIRTUAL_ROOM_ID:
                    continue

                if not self._passes_soft_capacity_pruning(event, room):
                    continue
                if not self._room_matches_event_type(event, room):
                    continue

                is_tight = self._is_overcrowded_placement(event, room)

                for day in self.days:
                    for shift in shift_candidates:
                        if not self._fits_shift(event, shift):
                            continue
                        if not self._is_valid_shift(event, shift):
                            continue
                        if is_virtual and room_id != self.VIRTUAL_ROOM_ID:
                            continue
                        if not is_virtual and room_id == self.VIRTUAL_ROOM_ID:
                            continue

                        if self._blocked_by_existing_occupancy(event, room_id, day, shift):
                            continue

                        var_name = (
                            f"p2_x_{self._sanitize_var_token(event_id)}_"
                            f"{self._sanitize_var_token(room_id)}_d{day}_s{shift}"
                        )
                        var = model2.NewBoolVar(var_name)
                        key = (event_id, room_id, day, shift)
                        X2[key] = var
                        event_vars.append(var)
                        placement_meta[key] = {"is_tight": is_tight}
                        duration = self._safe_int(event.get("duration"), self.session_block_size)
                        occupied_periods = self._occupied_periods(
                            shift,
                            duration,
                            self.max_period,
                        )

                        if room_id != self.VIRTUAL_ROOM_ID:
                            for period in occupied_periods:
                                room_period_index[(room_id, day, period)].append(var)

                        lecturer_id = event.get("lecturer_id")
                        if not pd.isna(lecturer_id) and str(lecturer_id).strip():
                            lecturer_key = str(lecturer_id).strip()
                            lecturer_day_index[(lecturer_key, day)].append(var)
                            for period in occupied_periods:
                                lecturer_period_index[(lecturer_key, day, period)].append(var)

                        for group_id in event.get("student_groups") or []:
                            if group_id:
                                for period in occupied_periods:
                                    group_period_index[(str(group_id), day, period)].append(var)

                        section_id = event.get("section_id")
                        if section_id:
                            week_from, week_to = self._resolve_week_window(event)
                            section_day_index[(str(section_id), day, week_from, week_to)].append(var)

                        if is_tight:
                            event_tight_vars[event_id].append(var)

            if not event_vars:
                events_without_slots.append(event_id)
                model2.Add(is_sched_var == 0)
            else:
                model2.Add(sum(event_vars) == is_sched_var)

        if not X2:
            print(f"[!] {log_prefix}: zero placement variables after soft pruning.")
            return {"scheduled": [], "unscheduled": target_ids}

        print(
            f"[*] {log_prefix}: created {len(X2)} placement vars for "
            f"{len(is_scheduled2)} event(s)."
        )

        hc2_count = 0
        for slot_key, vars_at_slot in room_period_index.items():
            base_occ = base_maps["room_period"].get(slot_key, 0)
            if base_occ > 0:
                model2.Add(sum(vars_at_slot) == 0)
                continue
            if len(vars_at_slot) > 1:
                model2.AddAtMostOne(vars_at_slot)
                hc2_count += 1

        hc3_count = 0
        for slot_key, vars_at_slot in lecturer_period_index.items():
            base_occ = base_maps["lecturer_period"].get(slot_key, 0)
            if base_occ > 0:
                model2.Add(sum(vars_at_slot) == 0)
                continue
            if len(vars_at_slot) > 1:
                model2.AddAtMostOne(vars_at_slot)
                hc3_count += 1

        hc4_count = 0
        for slot_key, vars_at_slot in group_period_index.items():
            base_occ = base_maps["group_period"].get(slot_key, 0)
            if base_occ > 0:
                model2.Add(sum(vars_at_slot) == 0)
                continue
            if len(vars_at_slot) > 1:
                model2.AddAtMostOne(vars_at_slot)
                hc4_count += 1

        is_overcrowded = {}
        for event_id, tight_vars in event_tight_vars.items():
            oc_var = model2.NewBoolVar(f"p2_oc_{self._sanitize_var_token(event_id)}")
            is_overcrowded[event_id] = oc_var
            for var in tight_vars:
                model2.Add(var <= oc_var)
            model2.Add(oc_var <= sum(tight_vars))

        is_fatigued = {}
        hc7_soft_count = 0
        strict_cap = self.max_lecturer_shifts_per_day
        relaxed_cap = self.RELAXED_MAX_SHIFTS_PER_DAY

        for (lecturer_id, day), vars_on_day in lecturer_day_index.items():
            if not vars_on_day:
                continue

            base_shifts = base_maps["lecturer_day"].get((lecturer_id, day), 0)
            if base_shifts >= relaxed_cap:
                model2.Add(sum(vars_on_day) == 0)
                continue

            fatigue_var = model2.NewBoolVar(
                f"p2_fatigue_{self._sanitize_var_token(lecturer_id)}_d{day}"
            )
            is_fatigued[(lecturer_id, day)] = fatigue_var
            total_shifts = base_shifts + sum(vars_on_day)

            model2.Add(total_shifts <= relaxed_cap)
            model2.Add(total_shifts <= strict_cap + fatigue_var)
            model2.Add(relaxed_cap * fatigue_var <= total_shifts)
            hc7_soft_count += 1

        is_crammed = {}
        hc6_soft_count = 0
        for (section_id, day, _week_from, _week_to), vars_on_day in section_day_index.items():
            if not vars_on_day:
                continue

            base_parts = base_maps["section_day"].get((section_id, day, _week_from, _week_to), 0)
            cram_var = model2.NewBoolVar(
                f"p2_cram_{self._sanitize_var_token(section_id)}_d{day}"
            )
            is_crammed[(section_id, day)] = cram_var
            total_parts = base_parts + sum(vars_on_day)

            model2.Add(total_parts <= 1 + cram_var)
            model2.Add(2 * cram_var <= total_parts)
            hc6_soft_count += 1

        hc8_count = 0
        if self.fixed_room_per_section:
            events_index = self.events.set_index("event_id", drop=False)
            section_event_map = defaultdict(list)
            for event_id in is_scheduled2:
                if event_id not in events_index.index:
                    continue
                event_row = events_index.loc[event_id]
                if isinstance(event_row, pd.DataFrame):
                    event_row = event_row.iloc[0]
                if self._uses_virtual_room(event_row):
                    continue
                section_id = event_row.get("section_id")
                if section_id:
                    section_event_map[str(section_id)].append(event_id)

            for section_id, section_event_ids in section_event_map.items():
                if len(section_event_ids) < 2:
                    continue

                candidate_rooms = sorted({
                    key[1]
                    for key in X2
                    if key[0] in section_event_ids
                })
                if not candidate_rooms:
                    continue

                home_vars = {}
                for room_id in candidate_rooms:
                    token = (
                        f"{self._sanitize_var_token(section_id)}_"
                        f"{self._sanitize_var_token(room_id)}"
                    )
                    home_vars[room_id] = model2.NewBoolVar(f"p2_home_{token}")

                model2.Add(sum(home_vars.values()) <= 1)
                hc8_count += 1

                for room_id, home_var in home_vars.items():
                    for event_id in section_event_ids:
                        for key, placement_var in X2.items():
                            if key[0] == event_id and key[1] == room_id:
                                model2.Add(placement_var <= home_var)

        objective_terms = [
            self.REWARD_SCHEDULED * is_sched_var
            for is_sched_var in is_scheduled2.values()
        ]
        objective_terms.extend(
            -self.PENALTY_OVERCROWDED * oc_var for oc_var in is_overcrowded.values()
        )
        objective_terms.extend(
            -self.PENALTY_FATIGUED * fatigue_var for fatigue_var in is_fatigued.values()
        )
        objective_terms.extend(
            -self.PENALTY_CRAMMED * cram_var for cram_var in is_crammed.values()
        )
        model2.Maximize(sum(objective_terms))

        print(f"[*] {log_prefix} HC2 room AddAtMostOne groups: {hc2_count}")
        print(f"[*] {log_prefix} HC3 lecturer AddAtMostOne groups: {hc3_count}")
        print(f"[*] {log_prefix} HC4 student group AddAtMostOne groups: {hc4_count}")
        print(f"[*] {log_prefix} soft HC6 (crammed) groups: {hc6_soft_count}")
        print(f"[*] {log_prefix} soft HC7 (fatigue) groups: {hc7_soft_count}")
        print(f"[*] {log_prefix} HC8 fixed room per section groups: {hc8_count}")
        print(
            f"[*] {log_prefix} penalties: overcrowded={len(is_overcrowded)}, "
            f"fatigued={len(is_fatigued)}, crammed={len(is_crammed)}"
        )

        max_time = float(
            max_time_seconds
            if max_time_seconds is not None
            else self.config.get(
                "relaxation_max_time_seconds",
                self.DEFAULT_RELAXATION_MAX_TIME_SECONDS,
            )
        )
        solver, _, num_workers = self._create_solver(max_time=max_time)

        print(
            f"[*] {log_prefix}: running CP-SAT "
            f"(max_time={max_time}s, workers={num_workers})..."
        )
        status = solver.Solve(model2)
        status_label = self._solver_status_label(status)
        print(f"[*] {log_prefix} status: {status_label}")
        print(
            f"[*] {log_prefix} objective: "
            f"{solver.ObjectiveValue() if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else 'n/a'}, "
            f"wall_time={solver.WallTime():.2f}s"
        )

        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return {"scheduled": [], "unscheduled": target_ids}

        still_unscheduled = [
            event_id
            for event_id, var in is_scheduled2.items()
            if not solver.BooleanValue(var)
        ]

        lecturer_day_flags = defaultdict(lambda: {"fatigued": False})
        section_day_flags = defaultdict(lambda: {"crammed": False})

        for (lecturer_id, day), fatigue_var in is_fatigued.items():
            if solver.BooleanValue(fatigue_var):
                lecturer_day_flags[(lecturer_id, day)]["fatigued"] = True

        for (section_id, day), cram_var in is_crammed.items():
            if solver.BooleanValue(cram_var):
                section_day_flags[(section_id, day)]["crammed"] = True

        overcrowded_events = {
            event_id
            for event_id, oc_var in is_overcrowded.items()
            if solver.BooleanValue(oc_var)
        }

        relaxed_results = []
        for key, var in X2.items():
            if not solver.BooleanValue(var):
                continue

            event_id, room_id, day, shift = key
            meta = placement_meta.get(key, {})
            events_index = self.events.set_index("event_id", drop=False)
            event_row = events_index.loc[event_id] if event_id in events_index.index else None
            if isinstance(event_row, pd.DataFrame):
                event_row = event_row.iloc[0]

            lecturer_id = None
            section_id = None
            if event_row is not None:
                lecturer_id = event_row.get("lecturer_id")
                section_id = event_row.get("section_id")

            lecturer_key = (
                str(lecturer_id).strip()
                if lecturer_id is not None and not pd.isna(lecturer_id) and str(lecturer_id).strip()
                else None
            )
            section_key = str(section_id) if section_id else None

            used_overcrowded = (
                event_id in overcrowded_events or meta.get("is_tight", False)
            )
            used_fatigued = (
                lecturer_key is not None
                and lecturer_day_flags[(lecturer_key, int(day))]["fatigued"]
            )
            used_crammed = (
                section_key is not None
                and section_day_flags[(section_key, int(day))]["crammed"]
            )

            relaxation_reason = self._compose_relaxation_reason(
                used_overcrowded,
                used_fatigued,
                used_crammed,
                base_reason=base_relaxation_reason,
            )

            relaxed_results.append(
                {
                    "event_id": event_id,
                    "room_id": room_id,
                    "day": day,
                    "start_period": shift,
                    "is_relaxed": True,
                    "relaxation_reason": relaxation_reason,
                }
            )

        print(
            f"[*] {log_prefix}: scheduled {len(relaxed_results)} relaxed placement(s); "
            f"{len(still_unscheduled)} still unscheduled."
        )

        if events_without_slots:
            print(
                f"[!] {log_prefix}: {len(events_without_slots)} event(s) had no soft slots."
            )

        return {
            "scheduled": relaxed_results,
            "unscheduled": still_unscheduled,
        }

    def run_relaxation_pass(self, leftover_events, base_timetable):
        leftover_ids = [str(event_id) for event_id in leftover_events]
        return self._run_soft_placement_pass(
            leftover_ids,
            base_timetable,
            log_prefix="Phase 2",
        )

    def run_lns_repair_pass(self, unscheduled_ids, full_schedule):
        remaining = [str(event_id) for event_id in unscheduled_ids]
        if not remaining:
            return {
                "scheduled": list(full_schedule),
                "unscheduled": [],
                "relocated_count": 0,
            }

        if not self.config.get("enable_lns_pass", True):
            print("[*] Phase 3 LNS repair pass disabled via config.")
            return {
                "scheduled": list(full_schedule),
                "unscheduled": remaining,
                "relocated_count": 0,
            }

        max_iterations = max(
            int(self.config.get("lns_max_iterations", self.DEFAULT_LNS_MAX_ITERATIONS)),
            1,
        )
        lns_max_time = float(
            self.config.get("lns_max_time_seconds", self.DEFAULT_LNS_MAX_TIME_SECONDS)
        )

        current_schedule = list(full_schedule)
        relocated_count = 0

        print(
            f"[*] Phase 3 (LNS repair): starting with {len(remaining)} unscheduled "
            f"event(s), up to {max_iterations} iteration(s)..."
        )

        for iteration in range(1, max_iterations + 1):
            if not remaining:
                break

            before_remaining = len(remaining)
            neighborhood = self._expand_lns_neighborhood(remaining, current_schedule)
            if not neighborhood:
                break

            frozen = [
                row
                for row in current_schedule
                if str(row.get("event_id")) not in neighborhood
            ]
            unlocked_before = {
                str(row.get("event_id"))
                for row in current_schedule
                if str(row.get("event_id")) in neighborhood
            }

            print(
                f"[*] Phase 3 LNS iter {iteration}/{max_iterations}: "
                f"neighborhood={len(neighborhood)} "
                f"(unlock {len(unlocked_before)} placement(s), keep {len(frozen)} fixed)."
            )

            output = self._run_soft_placement_pass(
                neighborhood,
                frozen,
                log_prefix=f"Phase 3 LNS#{iteration}",
                base_relaxation_reason=self.REASON_LNS,
                max_time_seconds=lns_max_time,
            )

            scheduled_ids = {str(row.get("event_id")) for row in output["scheduled"]}
            relocated_count += len(unlocked_before.intersection(scheduled_ids))

            current_schedule = frozen + output["scheduled"]
            remaining = [str(event_id) for event_id in output["unscheduled"]]

            print(
                f"[*] Phase 3 LNS iter {iteration}: "
                f"unscheduled {before_remaining} -> {len(remaining)}."
            )

            if len(remaining) >= before_remaining:
                print(
                    f"[*] Phase 3 LNS: stopping early — no improvement in iteration {iteration}."
                )
                break

        print(
            f"[*] Phase 3 LNS complete: relocated {relocated_count} placement(s) in "
            f"neighborhood replanning; {len(remaining)} event(s) still unscheduled."
        )

        return {
            "scheduled": current_schedule,
            "unscheduled": remaining,
            "relocated_count": relocated_count,
        }

    def solve(self):
        enable_relaxation = self.config.get("enable_relaxation_pass", True)

        phase1_output = self._run_phase1_solver()
        phase1_scheduled = phase1_output["scheduled"]
        phase1_unscheduled = phase1_output["unscheduled"]

        phase2_scheduled = []
        final_unscheduled = phase1_unscheduled

        if phase1_unscheduled and enable_relaxation:
            print(
                f"[*] Triggering Phase 2 relaxation for {len(phase1_unscheduled)} "
                f"leftover event(s)..."
            )
            phase2_output = self.run_relaxation_pass(phase1_unscheduled, phase1_scheduled)
            phase2_scheduled = phase2_output["scheduled"]
            final_unscheduled = phase2_output["unscheduled"]
        elif phase1_unscheduled:
            print("[*] Phase 2 relaxation pass disabled via config.")

        merged_results = phase1_scheduled + phase2_scheduled
        phase3_relocated = 0
        phase3_scheduled = 0
        enable_lns = self.config.get("enable_lns_pass", True)
        unscheduled_before_lns = len(final_unscheduled)

        if final_unscheduled and enable_lns:
            lns_output = self.run_lns_repair_pass(final_unscheduled, merged_results)
            merged_results = lns_output["scheduled"]
            final_unscheduled = lns_output["unscheduled"]
            phase3_relocated = lns_output.get("relocated_count", 0)
            phase3_scheduled = max(0, unscheduled_before_lns - len(final_unscheduled))
        elif final_unscheduled:
            print("[*] Phase 3 LNS repair pass disabled via config.")

        self.timetable = merged_results
        self.unscheduled_classes = self._build_unscheduled_classes(final_unscheduled)

        relaxed_count = len(phase2_scheduled)
        strict_count = len(phase1_scheduled)

        print(
            f"[*] Final merge: {strict_count} strict + {len(phase2_scheduled)} phase-2 relaxed "
            f"+ {phase3_scheduled} phase-3 LNS = {len(merged_results)} total placement(s); "
            f"{len(final_unscheduled)} unscheduled "
            f"({phase3_relocated} placement(s) repositioned in LNS)."
        )

        return {
            "scheduled": pd.DataFrame(merged_results) if merged_results else pd.DataFrame(),
            "unscheduled": final_unscheduled,
            "phase1_scheduled": len(phase1_scheduled),
            "phase2_scheduled": relaxed_count,
            "phase3_scheduled": phase3_scheduled,
            "phase3_relocated": phase3_relocated,
        }
