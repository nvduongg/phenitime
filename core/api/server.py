from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import pandas as pd
import traceback

from data.data_loader import DataLoader
from algorithms.event_generator import EventGenerator
from algorithms.scheduler import TimetableScheduler
from algorithms.assigner import assign_lecturers

app = FastAPI(
    title="Phenitime Core Engine API",
    description="API lõi xử lý Thuật toán Xếp thời khóa biểu",
    version="1.0.0",
)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "phenitime-core"}


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ExistingOccupancyInput(BaseModel):
    room_id: str
    day_of_week: int = Field(ge=2, le=7)
    start_period: int = Field(ge=1, le=15)
    period_count: int = Field(default=3, ge=1, le=15)
    week_from: int = Field(default=1, ge=1)
    week_to: int = Field(default=99, ge=1)


class AlgorithmConfig(BaseModel):
    shift_duration: int = 3
    max_lecturer_shifts_per_day: int = Field(default=2, ge=1, le=5)
    allowed_start_periods: list[int] = Field(default_factory=list)
    regular_starts: list[int] = Field(default_factory=list)
    evening_starts: list[int] = Field(default_factory=lambda: [13])
    allowed_days: list[int] = Field(default_factory=lambda: list(range(2, 8)))
    solver_max_time_seconds: float = Field(default=60.0, ge=10.0, le=600.0)
    solver_num_workers: int = Field(default=8, ge=1, le=32)
    enable_relaxation_pass: bool = True
    relaxation_max_time_seconds: float = Field(default=60.0, ge=10.0, le=600.0)
    soft_capacity_ratio: float = Field(default=0.9, ge=0.1, le=1.0)
    relaxed_max_shifts_per_day: int = Field(default=3, ge=1, le=6)
    enable_lns_pass: bool = True
    lns_max_iterations: int = Field(default=3, ge=1, le=10)
    lns_max_neighborhood: int = Field(default=40, ge=5, le=120)
    lns_max_time_seconds: float = Field(default=90.0, ge=10.0, le=600.0)
    existing_occupancy: list[ExistingOccupancyInput] = Field(default_factory=list)
    fixed_room_per_section: bool = True
    virtual_room_capacity: int = Field(default=9999, ge=1)


class RoomInput(BaseModel):
    room_id: str
    capacity: int = Field(default=0, ge=0)
    room_type: str = "LT"


class EventInput(BaseModel):
    event_id: str
    section_id: str
    course_id: str | None = None
    lecturer_id: str | None = None
    class_type: str | None = None
    duration: int = Field(default=3, ge=1)
    weekly_periods: int | None = None
    event_part: int | None = None
    week_from: int | None = None
    week_to: int | None = None
    rhythm_mode: str | None = None
    capacity: int = Field(default=0, ge=0)
    student_groups: list[str] = Field(default_factory=list)
    room_type_req: str = "LT"


class ScheduleRequest(BaseModel):
    semester_id: str
    config: AlgorithmConfig = Field(default_factory=AlgorithmConfig)
    persist: bool = False
    rooms: list[RoomInput] | None = None
    events: list[EventInput] | None = None


def build_unscheduled_classes(df_events, unscheduled_event_ids):
    if df_events is None or df_events.empty:
        return [
            {"event_id": event_id, "section_id": event_id}
            for event_id in unscheduled_event_ids
        ]

    events_index = df_events.set_index("event_id")
    unscheduled_classes = []

    for event_id in unscheduled_event_ids:
        if event_id not in events_index.index:
            unscheduled_classes.append({"event_id": event_id, "section_id": event_id})
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


def build_timetable_rows(df_result, df_events):
    if df_result is None or df_result.empty:
        return []

    merge_columns = [
        "event_id",
        "section_id",
        "duration",
        "week_from",
        "week_to",
        "rhythm_mode",
    ]
    available_columns = [column for column in merge_columns if column in df_events.columns]
    df_final = df_result.merge(df_events[available_columns], on="event_id", how="left")

    timetable_rows = []
    for _, row in df_final.iterrows():
        if pd.isna(row.get("section_id")) or pd.isna(row.get("day")) or pd.isna(row.get("start_period")):
            continue

        row_payload = {
            "event_id": row["event_id"],
            "section_id": row["section_id"],
            "room_id": row["room_id"],
            "day_of_week": int(row["day"]),
            "start_period": int(row["start_period"]),
            "period_count": int(row.get("duration") or 0) or 3,
            "week_from": None if pd.isna(row.get("week_from")) else int(row["week_from"]),
            "week_to": None if pd.isna(row.get("week_to")) else int(row["week_to"]),
            "rhythm_mode": None if pd.isna(row.get("rhythm_mode")) else str(row["rhythm_mode"]),
        }

        if bool(row.get("is_relaxed")):
            row_payload["is_relaxed"] = True
            if row.get("relaxation_reason"):
                row_payload["relaxation_reason"] = str(row["relaxation_reason"])

        timetable_rows.append(row_payload)

    return timetable_rows


def build_empty_solve_response(scheduler, df_events, message="No valid placements found."):
    unscheduled_event_ids = list(getattr(scheduler, "Unscheduled", {}).keys())
    unscheduled_classes = getattr(scheduler, "unscheduled_classes", None)
    if not unscheduled_classes:
        unscheduled_classes = build_unscheduled_classes(df_events, unscheduled_event_ids)

    return {
        "status": "success",
        "message": message,
        "total_events": 0,
        "total_scheduled": 0,
        "total_unscheduled": len(unscheduled_classes),
        "data": [],
        "timetable": [],
        "unscheduled_classes": unscheduled_classes,
    }


class SectionInput(BaseModel):
    section_id: str
    course_id: str | None = None
    weight: float = Field(default=1, ge=0.5)


class LecturerInput(BaseModel):
    lecturer_id: str
    max_quota: int = Field(default=15, ge=1)
    current_load: float = Field(default=0, ge=0)
    course_ids: list[str] = Field(default_factory=list)


class AssignLecturersRequest(BaseModel):
    sections: list[SectionInput]
    lecturers: list[LecturerInput]


@app.post("/api/v1/solve")
def solve_timetable(request: ScheduleRequest):
    print(f"[*] Received solve request for semester: {request.semester_id}")
    print(
        f"[*] Shift config — blocks: {request.config.allowed_start_periods}, "
        f"evening: {request.config.evening_starts}, "
        f"days: {request.config.allowed_days}"
    )

    loader = DataLoader()
    allowed_start_periods = (
        request.config.allowed_start_periods
        or request.config.regular_starts
        or [1, 4, 7, 10, 13]
    )
    generator = EventGenerator(shift_duration=request.config.shift_duration)
    df_events = pd.DataFrame()

    try:
        df_sections = loader.get_course_sections(request.semester_id)

        if df_sections.empty:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"No course sections found for semester '{request.semester_id}'. "
                    "Import or generate course sections first."
                ),
            )

        if request.rooms:
            df_rooms = pd.DataFrame([room.model_dump() for room in request.rooms])
            if not df_rooms.empty:
                df_rooms["capacity"] = pd.to_numeric(df_rooms["capacity"], errors="coerce").fillna(0).astype(int)
                df_rooms["room_type"] = (
                    df_rooms["room_type"].astype(str).str.strip().str.upper()
                )
            print(f"[*] Using {len(df_rooms)} rooms from request payload.")
        else:
            df_rooms = loader.get_rooms()
            print(f"[*] Loaded {len(df_rooms)} rooms from database.")

        if df_rooms.empty:
            raise HTTPException(
                status_code=400,
                detail="Room master data is empty. Add rooms before running the scheduler.",
            )

        if request.events:
            payload_events = [event.model_dump() for event in request.events]
            df_events = pd.DataFrame(payload_events)
            if "student_groups" not in df_events.columns:
                df_events["student_groups"] = [[] for _ in range(len(df_events))]
            df_events["student_groups"] = df_events["student_groups"].apply(
                lambda groups: groups if isinstance(groups, list) else []
            )
            if "room_type_req" in df_events.columns:
                df_events["room_type_req"] = (
                    df_events["room_type_req"]
                    .fillna("LT")
                    .astype(str)
                    .str.strip()
                    .str.upper()
                )
            print(
                f"[*] Using {len(df_events)} pre-built events from Node payload "
                f"(skipped Python event expansion)."
            )
        else:
            df_events = generator.generate_events(df_sections)
            print(f"[*] Generated {len(df_events)} events from database sections.")

        if df_events.empty:
            return {
                "status": "success",
                "message": "No schedulable events were generated for this semester.",
                "total_events": 0,
                "total_scheduled": 0,
                "total_unscheduled": 0,
                "data": [],
                "timetable": [],
                "unscheduled_classes": [],
            }

        scheduler = TimetableScheduler(
            df_events,
            df_rooms,
            config={
                "shift_duration": request.config.shift_duration,
                "max_lecturer_shifts_per_day": request.config.max_lecturer_shifts_per_day,
                "allowed_start_periods": allowed_start_periods,
                "regular_starts": allowed_start_periods,
                "evening_starts": request.config.evening_starts,
                "allowed_days": request.config.allowed_days,
                "solver_max_time_seconds": request.config.solver_max_time_seconds,
                "enable_relaxation_pass": request.config.enable_relaxation_pass,
                "enable_lns_pass": request.config.enable_lns_pass,
                "lns_max_iterations": request.config.lns_max_iterations,
                "lns_max_neighborhood": request.config.lns_max_neighborhood,
                "lns_max_time_seconds": request.config.lns_max_time_seconds,
                "existing_occupancy": [
                    block.model_dump() for block in request.config.existing_occupancy
                ],
                "fixed_room_per_section": request.config.fixed_room_per_section,
            },
        )
        scheduler.build_model()
        scheduler.add_hard_constraints()

        if len(scheduler.X) == 0:
            print("[!] Zero placement variables after pruning. Returning empty timetable.")
            return build_empty_solve_response(scheduler, df_events)

        solve_output = scheduler.solve()
        df_result = solve_output["scheduled"]
        unscheduled_event_ids = solve_output["unscheduled"]
        unscheduled_classes = scheduler.unscheduled_classes or build_unscheduled_classes(
            df_events,
            unscheduled_event_ids,
        )

        try:
            timetable_rows = build_timetable_rows(df_result, df_events)
        except Exception as formatting_error:
            print("[!] Timetable response formatting failed:")
            traceback.print_exc()
            return build_empty_solve_response(
                scheduler,
                df_events,
                message=f"No valid placements found. Formatter error: {formatting_error}",
            )

        if len(timetable_rows) == 0:
            print("[!] Solver finished but produced zero timetable rows.")
            return build_empty_solve_response(
                scheduler,
                df_events,
                message="No valid placements found.",
            )

        if request.persist and timetable_rows:
            is_saved = loader.save_timetables(
                df_result,
                df_events,
                request.semester_id,
            )
            if not is_saved:
                raise HTTPException(
                    status_code=500,
                    detail="Scheduling succeeded but saving timetables to the database failed.",
                )

        scheduled_count = len(timetable_rows)
        unscheduled_count = len(unscheduled_classes)

        if unscheduled_count > 0:
            message = (
                f"Scheduled {scheduled_count} sessions. "
                f"{unscheduled_count} sessions could not be placed automatically."
            )
        else:
            message = "Scheduler completed successfully."

        return {
            "status": "success",
            "message": message,
            "total_events": scheduled_count,
            "total_scheduled": scheduled_count,
            "total_unscheduled": unscheduled_count,
            "data": timetable_rows,
            "timetable": timetable_rows,
            "unscheduled_classes": unscheduled_classes,
            "phase1_scheduled": solve_output.get("phase1_scheduled"),
            "phase2_scheduled": solve_output.get("phase2_scheduled"),
            "phase3_scheduled": solve_output.get("phase3_scheduled"),
            "phase3_relocated": solve_output.get("phase3_relocated"),
        }

    except HTTPException:
        raise
    except Exception as error:
        print("[!] Solve endpoint failed:")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"System error: {str(error)}") from error

    finally:
        loader.close()


@app.post("/api/v1/assign-lecturers")
def assign_lecturers_endpoint(request: AssignLecturersRequest):
    print(f"[*] Nhận yêu cầu phân công giảng viên: {len(request.sections)} lớp, {len(request.lecturers)} GV")

    try:
        result = assign_lecturers(
            sections=[item.model_dump() for item in request.sections],
            lecturers=[item.model_dump() for item in request.lecturers],
        )

        if result["status"] == "fail":
            return result

        return result

    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Lỗi hệ thống: {str(error)}") from error
