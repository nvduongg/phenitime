const { ROLES, SCHOOL_SCOPED_ROLES } = require('../constants/roles');

const AUTHENTICATED_ROLES = Object.values(ROLES);

/** VP trường / VP khoa — xem lớp HP; chỉ ghi qua phân công giảng viên. */
const OFFICE_SCOPED_API_RULES = [
    { path: '/lecturers', methods: ['GET'] },
    { path: '/course-sections/auto-assign', methods: ['POST'] },
    { path: '/course-sections', methods: ['GET'] },
    { path: '/assignment-requests', methods: ['GET', 'POST'] },
    { path: '/organization-units', methods: ['GET'] },
    { path: '/semesters', methods: ['GET'] },
    { path: '/courses', methods: ['GET'] },
    { path: '/timetables', methods: ['GET'] },
    { path: '/rooms', methods: ['GET'] },
];

const COURSE_SECTION_ASSIGN_PUT = /^\/course-sections\/[^/]+$/;

function isOfficeScopedRole(role) {
    return SCHOOL_SCOPED_ROLES.has(role);
}

function isCourseSectionLecturerAssignPut(method, apiPath) {
    return method.toUpperCase() === 'PUT' && COURSE_SECTION_ASSIGN_PUT.test(apiPath);
}

function matchesOfficeApiRule(method, apiPath) {
    const m = method.toUpperCase();
    const p = apiPath.replace(/\/$/, '') || '/';

    if (isCourseSectionLecturerAssignPut(m, p)) {
        return true;
    }

    return OFFICE_SCOPED_API_RULES.some(
        (rule) =>
            (p === rule.path || p.startsWith(`${rule.path}/`)) && rule.methods.includes(m),
    );
}

function isRouteAllowed(role, method, apiPath) {
    const p = apiPath.replace(/\/$/, '') || '/';

    if (p.startsWith('/auth/')) {
        return true;
    }

    if (role === ROLES.UNIVERSITY_TRAINING) {
        return true;
    }

    if (isOfficeScopedRole(role)) {
        if (p.startsWith('/users')) {
            return false;
        }
        return matchesOfficeApiRule(method, p);
    }

    return false;
}

module.exports = {
    AUTHENTICATED_ROLES,
    OFFICE_SCOPED_API_RULES,
    isOfficeScopedRole,
    isCourseSectionLecturerAssignPut,
    isRouteAllowed,
};
