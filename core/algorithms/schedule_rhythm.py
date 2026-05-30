DEFAULT_MAX_WEEKS = 10
DEFAULT_SHIFT_DURATION = 3
RHYTHM_UNIFORM = "UNIFORM"
RHYTHM_PHASE_5_5 = "PHASE_5_5"


def resolve_schedule_rhythm(params, options=None):
    options = options or {}
    if not params:
        return None

    block_size = max(int(options.get("shift_duration", DEFAULT_SHIFT_DURATION)), 1)
    max_weeks = max(int(options.get("max_weeks", DEFAULT_MAX_WEEKS)), 1)
    stretch_enabled = options.get("stretch_enabled", True)
    min_shifts = int(options.get("min_shifts_for_stretch", 2))
    num_shifts = int(params.get("numShifts") or 0)

    uniform_plan = {
        "mode": RHYTHM_UNIFORM,
        "totalPeriods": params["totalPeriods"],
        "stPerWeek": params["stPerWeek"],
        "durationWeeks": params["actualWeeks"],
        "maxWeeks": max_weeks,
        "phases": [{
            "weekFrom": 1,
            "weekTo": params["actualWeeks"],
            "shiftsPerWeek": num_shifts,
            "periodsPerWeek": params["stPerWeek"],
        }],
        "scheduleParams": dict(params),
    }

    can_stretch = (
        stretch_enabled
        and params["actualWeeks"] < max_weeks
        and num_shifts >= min_shifts
    )
    if not can_stretch:
        return uniform_plan

    phase1_periods = 5 * block_size
    phase2_periods = 5 * 2 * block_size
    if params["totalPeriods"] == phase1_periods + phase2_periods:
        peak = block_size * 2
        stretched = dict(params)
        stretched["actualWeeks"] = max_weeks
        stretched["stPerWeek"] = peak
        stretched["numShifts"] = 3
        return {
            "mode": RHYTHM_PHASE_5_5,
            "totalPeriods": params["totalPeriods"],
            "stPerWeek": peak,
            "durationWeeks": max_weeks,
            "maxWeeks": max_weeks,
            "phases": [
                {"weekFrom": 1, "weekTo": 5, "shiftsPerWeek": 1, "periodsPerWeek": block_size},
                {"weekFrom": 6, "weekTo": max_weeks, "shiftsPerWeek": 2, "periodsPerWeek": peak},
            ],
            "scheduleParams": stretched,
        }

    return uniform_plan


def build_scheduling_events_from_plan(plan, shift_duration=DEFAULT_SHIFT_DURATION):
    if not plan or not plan.get("phases"):
        return []

    block_size = max(int(shift_duration or DEFAULT_SHIFT_DURATION), 1)
    events = []
    part_index = 1

    for phase in plan["phases"]:
        periods_per_week = int(phase.get("periodsPerWeek") or block_size)
        shift_count = int(phase.get("shiftsPerWeek") or 0)
        if periods_per_week > block_size:
            shift_count = max(shift_count, (periods_per_week + block_size - 1) // block_size)

        for _ in range(shift_count):
            events.append({
                "event_part": part_index,
                "duration": block_size,
                "weekly_periods": periods_per_week,
                "week_from": phase.get("weekFrom"),
                "week_to": phase.get("weekTo"),
                "rhythm_mode": plan.get("mode"),
            })
            part_index += 1

    return events


def build_scheduling_events_from_params(params, shift_duration=DEFAULT_SHIFT_DURATION, options=None):
    plan = resolve_schedule_rhythm(params, options)
    return build_scheduling_events_from_plan(plan, shift_duration)
