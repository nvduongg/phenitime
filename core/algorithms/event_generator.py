import pandas as pd

from algorithms.schedule_rhythm import build_scheduling_events_from_params
from algorithms.learning_modes import (
    ASYNC_ONLINE_CLASS_TYPES,
    get_learning_mode,
    should_skip_scheduling,
)

DEFAULT_SHIFT_DURATION = 3
DEFAULT_MAX_WEEKS = 10
COMBINED_ROOM_TYPES = frozenset({"PM"})


def calculate_schedule_params(credits, schedule_type="LT", max_weeks=DEFAULT_MAX_WEEKS, shift_duration=DEFAULT_SHIFT_DURATION):
    normalized_credits = float(credits or 0)
    if normalized_credits <= 0:
        return None

    block_size = max(int(shift_duration or DEFAULT_SHIFT_DURATION), 1)
    weeks = max(int(max_weeks or DEFAULT_MAX_WEEKS), 1)
    schedule_type = str(schedule_type or "LT").upper()

    total_periods = normalized_credits * 15 if schedule_type == "LT" else normalized_credits * 30
    min_periods_per_week = total_periods / weeks
    st_per_week = int((-(-min_periods_per_week // block_size)) * block_size)
    actual_weeks = int(-(-total_periods // st_per_week))
    num_shifts = st_per_week / block_size

    return {
        "totalPeriods": total_periods,
        "stPerWeek": st_per_week,
        "actualWeeks": actual_weeks,
        "numShifts": num_shifts,
    }


class EventGenerator:
    """
    Expand course sections into weekly scheduling events for the MILP engine.

    Weekly load (ST/tuần) follows Quyết định 1062:
    LT credits -> 15 periods/credit, TH credits -> 30 periods/credit,
    compressed into at most 10 teaching weeks using 3-period ca blocks.
    """

    def __init__(self, shift_duration=DEFAULT_SHIFT_DURATION, max_weeks=DEFAULT_MAX_WEEKS):
        self.shift_duration = max(int(shift_duration or DEFAULT_SHIFT_DURATION), 1)
        self.max_weeks = max(int(max_weeks or DEFAULT_MAX_WEEKS), 1)

    def compute_weekly_periods(self, credits, schedule_type="LT"):
        params = calculate_schedule_params(
            credits,
            schedule_type,
            self.max_weeks,
            self.shift_duration,
        )
        return params["stPerWeek"] if params else 0

    def build_scheduling_events(self, credits, schedule_type="LT"):
        params = calculate_schedule_params(
            credits,
            schedule_type,
            self.max_weeks,
            self.shift_duration,
        )
        if not params:
            return []

        rhythm_options = {
            "max_weeks": self.max_weeks,
            "shift_duration": self.shift_duration,
            "stretch_enabled": True,
            "min_shifts_for_stretch": 2,
        }
        return build_scheduling_events_from_params(
            params,
            self.shift_duration,
            rhythm_options,
        )

    def _resolve_credits(self, row):
        theory = float(row.get("theory_credits") or 0)
        practice = float(row.get("practice_credits") or 0)

        room_type_req = row.get("room_type_req")
        if room_type_req is None or (isinstance(room_type_req, float) and pd.isna(room_type_req)):
            room_type_req = row.get("course_default_room_type") or "LT"
        room_type_req = str(room_type_req).upper()

        if room_type_req in COMBINED_ROOM_TYPES and theory > 0 and practice > 0:
            return theory + practice, "LT"

        if room_type_req == "ONLINE":
            if theory > 0 and practice > 0:
                return theory + practice, "LT"
            return theory or practice, "LT"

        class_type = str(row.get("class_type", "")).upper()

        if class_type in ("LT", "OFFLINE", "HYBRID"):
            return theory, "LT"

        if class_type in ("ELN", "ĐA", "TT", "ONLINE_ELEARNING", "ONLINE_COURSERA"):
            return theory or practice, "LT"

        return practice, "TH"

    def generate_events(self, df_sections):
        events = []

        for _, row in df_sections.iterrows():
            if should_skip_scheduling(row):
                continue

            credits, schedule_type = self._resolve_credits(row)
            scheduling_events = self.build_scheduling_events(credits, schedule_type)

            if not scheduling_events:
                continue

            room_type_req = row.get("room_type_req")
            if room_type_req is None or (isinstance(room_type_req, float) and pd.isna(room_type_req)):
                room_type_req = row.get("course_default_room_type") or "LT"

            section_id = row["section_id"]

            for session in scheduling_events:
                part = session["event_part"]
                events.append(
                    {
                        "event_id": f"{section_id}_Part{part}",
                        "section_id": section_id,
                        "course_id": row["course_id"],
                        "lecturer_id": row["lecturer_id"],
                        "class_type": row["class_type"],
                        "duration": session["duration"],
                        "weekly_periods": session["weekly_periods"],
                        "event_part": part,
                        "week_from": session.get("week_from"),
                        "week_to": session.get("week_to"),
                        "rhythm_mode": session.get("rhythm_mode"),
                        "capacity": row["capacity"],
                        "student_groups": row["group_id"],
                        "room_type_req": str(room_type_req).upper(),
                    }
                )

        return pd.DataFrame(events)
