"""Unified Phenitime learning-mode taxonomy (mirrors backend/src/utils/learningModes.js)."""

LEARNING_MODES = {
    "THEORY": frozenset({"LT"}),
    "PRACTICE": frozenset({"TH", "PM", "TN", "SB", "XT"}),
    "ONLINE": frozenset({"ONLINE", "ELN", "ONLINE_ELEARNING", "ONLINE_COURSERA"}),
    "SPECIAL": frozenset({"DA", "ĐA", "KL", "TT", "DN", "BV"}),
}

ASYNC_ONLINE_CLASS_TYPES = frozenset({"ONLINE_ELEARNING", "ONLINE_COURSERA"})


def normalize_learning_type(value):
    return str(value or "").strip().upper()


def get_learning_mode(value):
    normalized = normalize_learning_type(value)

    if normalized in LEARNING_MODES["THEORY"]:
        return "THEORY"
    if normalized in LEARNING_MODES["PRACTICE"]:
        return "PRACTICE"
    if normalized in LEARNING_MODES["ONLINE"]:
        return "ONLINE"
    if normalized in LEARNING_MODES["SPECIAL"]:
        return "SPECIAL"

    return "THEORY"


def is_online_room_requirement(room_type_req):
    return normalize_learning_type(room_type_req) == "ONLINE"


def should_skip_scheduling(row):
    room_type_req = normalize_learning_type(
        row.get("room_type_req") or row.get("course_default_room_type") or "LT"
    )
    class_type = normalize_learning_type(row.get("class_type"))

    if room_type_req == "ONLINE" and class_type in ASYNC_ONLINE_CLASS_TYPES:
        return True

    return False
