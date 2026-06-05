import {
  BookOutlined,
  CalendarOutlined,
  DashboardOutlined,
  FolderOutlined,
  RobotOutlined,
  SolutionOutlined,
  TeamOutlined,
  UserSwitchOutlined,
  SwapOutlined,
} from '@ant-design/icons'

export const menuItems = [
  {
    key: '/',
    icon: <DashboardOutlined />,
    label: 'Tổng quan',
  },
  {
    key: 'master-data',
    icon: <FolderOutlined />,
    label: 'Quản lý danh mục',
    children: [
      { key: '/master-data/units', label: 'Đơn vị' },
      { key: '/master-data/cohorts', label: 'Niên khóa' },
      { key: '/master-data/semesters', label: 'Học kỳ' },
      { key: '/master-data/rooms', label: 'Phòng học' },
      { key: '/master-data/lecturers', label: 'Giảng viên' },
      { key: '/master-data/courses', label: 'Học phần' },
    ],
  },
  {
    key: 'academic',
    icon: <SolutionOutlined />,
    label: 'Quản lý đào tạo',
    children: [
      { key: '/academic/majors', label: 'Ngành đào tạo' },
      { key: '/academic/curriculums', label: 'Chương trình đào tạo' },
      { key: '/academic/student-groups', label: 'Lớp sinh viên' },
    ],
  },
  {
    key: '/course-sections',
    icon: <BookOutlined />,
    label: 'Lớp học phần',
  },
  {
    key: '/academic/lecturer-assignment',
    icon: <UserSwitchOutlined />,
    label: 'Phân công giảng viên',
  },
  {
    key: '/academic/assignment-requests',
    icon: <SwapOutlined />,
    label: 'Yêu cầu phân công',
  },
  {
    key: '/ai-scheduler',
    icon: <RobotOutlined />,
    label: 'Xếp lịch AI',
  },
  {
    key: '/timetables',
    icon: <CalendarOutlined />,
    label: 'Thời khóa biểu',
  },
  {
    key: 'admin',
    icon: <TeamOutlined />,
    label: 'Quản trị hệ thống',
    children: [{ key: '/admin/users', label: 'Tài khoản người dùng' }],
  },
]

export const getOpenMenuKeys = (pathname) => {
  if (pathname.startsWith('/admin')) {
    return ['admin']
  }
  if (pathname.startsWith('/master-data')) {
    return ['master-data']
  }
  if (
    pathname.startsWith('/academic/lecturer-assignment') ||
    pathname.startsWith('/academic/assignment-requests')
  ) {
    return []
  }
  if (pathname.startsWith('/academic')) {
    return ['academic']
  }
  return []
}

export const getSelectedMenuKey = (pathname) => {
  if (pathname.startsWith('/master-data') || pathname.startsWith('/academic')) {
    return pathname
  }
  return pathname
}
