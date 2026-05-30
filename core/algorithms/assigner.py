import pulp


def assign_lecturers(sections, lecturers):
    """
    Linear Programming assignment problem.

    Decision variable X[s, l] in {0, 1}: section s assigned to lecturer l.

    Hard constraints:
      - Each section assigned to exactly one lecturer.
      - For each lecturer: current_load + sum(weights) <= max_quota.

    Objective: minimize the maximum teaching load (load balancing).
    """
    if not sections:
        return {
            'status': 'success',
            'message': 'Không có lớp học phần cần phân công',
            'assignments': [],
            'total_assigned': 0,
        }

    if not lecturers:
        return {
            'status': 'fail',
            'message': 'Không có giảng viên khả dụng để phân công',
            'assignments': [],
        }

    section_ids = [item['section_id'] for item in sections]
    lecturer_ids = [item['lecturer_id'] for item in lecturers]
    section_course = {item['section_id']: item.get('course_id') for item in sections}
    weights = {item['section_id']: float(item.get('weight', 1)) for item in sections}
    max_quota = {item['lecturer_id']: int(item.get('max_quota', 15)) for item in lecturers}
    current_load = {item['lecturer_id']: float(item.get('current_load', 0)) for item in lecturers}
    lecturer_courses = {
        item['lecturer_id']: set(item.get('course_ids') or [])
        for item in lecturers
    }

    def is_eligible(section_id, lecturer_id):
        course_id = section_course.get(section_id)
        specialties = lecturer_courses.get(lecturer_id, set())
        if not specialties:
            return True
        if not course_id:
            return True
        return course_id in specialties

    total_demand = sum(weights.values())
    total_remaining_capacity = sum(
        max(0, max_quota[lecturer_id] - current_load[lecturer_id])
        for lecturer_id in lecturer_ids
    )

    if total_demand > total_remaining_capacity:
        return {
            'status': 'fail',
            'message': (
                f'Tổng tải học phần ({total_demand}) vượt quá tổng quota còn lại '
                f'của giảng viên ({total_remaining_capacity}). '
                'Vui lòng tăng max_quota hoặc bổ sung giảng viên.'
            ),
            'assignments': [],
        }

    prob = pulp.LpProblem('Phenitime_LecturerAssignment', pulp.LpMinimize)

    decision_vars = {}
    for section_id in section_ids:
        for lecturer_id in lecturer_ids:
            if not is_eligible(section_id, lecturer_id):
                continue
            decision_vars[(section_id, lecturer_id)] = pulp.LpVariable(
                f'X_{section_id}_{lecturer_id}',
                cat=pulp.LpBinary,
            )

    for section_id in section_ids:
        eligible_vars = [
            decision_vars[(section_id, lecturer_id)]
            for lecturer_id in lecturer_ids
            if (section_id, lecturer_id) in decision_vars
        ]
        if not eligible_vars:
            return {
                'status': 'fail',
                'message': (
                    f'Lớp {section_id} không có giảng viên phù hợp chuyên môn. '
                    'Vui lòng cập nhật ma trận giảng viên – học phần.'
                ),
                'assignments': [],
            }
        prob += (
            pulp.lpSum(eligible_vars) == 1,
            f'AssignOnce_{section_id}',
        )

    for lecturer_id in lecturer_ids:
        assigned_vars = [
            weights[section_id] * decision_vars[(section_id, lecturer_id)]
            for section_id in section_ids
            if (section_id, lecturer_id) in decision_vars
        ]
        if not assigned_vars:
            continue
        prob += (
            current_load[lecturer_id] + pulp.lpSum(assigned_vars)
            <= max_quota[lecturer_id],
            f'Quota_{lecturer_id}',
        )

    max_load = pulp.LpVariable('max_load', lowBound=0, cat=pulp.LpContinuous)
    for lecturer_id in lecturer_ids:
        assigned_vars = [
            weights[section_id] * decision_vars[(section_id, lecturer_id)]
            for section_id in section_ids
            if (section_id, lecturer_id) in decision_vars
        ]
        if not assigned_vars:
            continue
        prob += (
            current_load[lecturer_id] + pulp.lpSum(assigned_vars)
            <= max_load,
            f'MaxLoad_{lecturer_id}',
        )

    prob += max_load

    solve_status = prob.solve(pulp.PULP_CBC_CMD(msg=False))

    if pulp.LpStatus[solve_status] != 'Optimal':
        return {
            'status': 'fail',
            'message': (
                'Không tìm được phương án phân công khả thi. '
                'Vui lòng kiểm tra quota giảng viên hoặc số lượng lớp chưa phân công.'
            ),
            'assignments': [],
        }

    assignments = []
    for section_id in section_ids:
        for lecturer_id in lecturer_ids:
            key = (section_id, lecturer_id)
            if key not in decision_vars:
                continue
            if pulp.value(decision_vars[key]) == 1:
                assignments.append({
                    'section_id': section_id,
                    'lecturer_id': lecturer_id,
                })
                break

    return {
        'status': 'success',
        'message': f'Phân công thành công {len(assignments)} lớp học phần',
        'assignments': assignments,
        'total_assigned': len(assignments),
    }
