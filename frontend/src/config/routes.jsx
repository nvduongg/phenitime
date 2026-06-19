import { Navigate } from 'react-router-dom'
import ProtectedRoute from '../components/Auth/ProtectedRoute.jsx'
import AppLayout from '../components/Layout/AppLayout.jsx'
import Login from '../pages/Auth/Login.jsx'
import DashboardHome from '../pages/Dashboard/DashboardHome.jsx'
import Departments from '../pages/MasterData/Departments.jsx'
import Cohorts from '../pages/MasterData/Cohorts.jsx'
import Semesters from '../pages/MasterData/Semesters.jsx'
import Rooms from '../pages/MasterData/Rooms.jsx'
import Lecturers from '../pages/MasterData/Lecturers.jsx'
import Courses from '../pages/MasterData/Courses.jsx'
import Curriculums from '../pages/Academic/Curriculums.jsx'
import Majors from '../pages/Academic/Majors.jsx'
import StudentGroups from '../pages/Academic/StudentGroups.jsx'
import LecturerAssignment from '../pages/Academic/LecturerAssignment.jsx'
import AssignmentRequests from '../pages/Academic/AssignmentRequests.jsx'
import CourseSections from '../pages/CourseSections/index.jsx'
import AiScheduler from '../pages/AiScheduler/index.jsx'
import Timetables from '../pages/Timetables/index.jsx'
import Users from '../pages/Admin/Users.jsx'
import SystemSettings from '../pages/Settings/index.jsx'
import { ROLES } from '../constants/roles'

export const appRoutes = [
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <DashboardHome /> },
      { path: 'master-data/units', element: <Departments /> },
      { path: 'master-data/cohorts', element: <Cohorts /> },
      { path: 'master-data/semesters', element: <Semesters /> },
      { path: 'master-data/rooms', element: <Rooms /> },
      { path: 'master-data/lecturers', element: <Lecturers /> },
      { path: 'master-data/courses', element: <Courses /> },
      { path: 'academic/majors', element: <Majors /> },
      { path: 'academic/curriculums', element: <Curriculums /> },
      { path: 'academic/student-groups', element: <StudentGroups /> },
      { path: 'academic/lecturer-assignment', element: <LecturerAssignment /> },
      { path: 'academic/assignment-requests', element: <AssignmentRequests /> },
      { path: 'course-sections', element: <CourseSections /> },
      { path: 'ai-scheduler', element: <AiScheduler /> },
      { path: 'timetables', element: <Timetables /> },
      {
        path: 'admin/users',
        element: (
          <ProtectedRoute roles={[ROLES.UNIVERSITY_TRAINING]}>
            <Users />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/settings',
        element: (
          <ProtectedRoute roles={[ROLES.UNIVERSITY_TRAINING]}>
            <SystemSettings />
          </ProtectedRoute>
        ),
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]
