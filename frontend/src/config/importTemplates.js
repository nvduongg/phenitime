export const IMPORT_TEMPLATES = {
  courses: {
    url: '/templates/mau-nhap-hoc-phan.xlsx',
    fileName: 'mau-nhap-hoc-phan.xlsx',
    title: 'Học phần',
  },
  majors: {
    url: '/templates/mau-nhap-nganh-dao-tao.xlsx',
    fileName: 'mau-nhap-nganh-dao-tao.xlsx',
    title: 'Ngành đào tạo',
  },
  lecturers: {
    url: '/templates/mau-nhap-giang-vien.xlsx',
    fileName: 'mau-nhap-giang-vien.xlsx',
    title: 'Giảng viên',
  },
  rooms: {
    url: '/templates/mau-nhap-phong-hoc.xlsx',
    fileName: 'mau-nhap-phong-hoc.xlsx',
    title: 'Phòng học',
  },
  courseSections: {
    url: '/templates/mau-nhap-lop-hoc-phan.xlsx',
    fileName: 'mau-nhap-lop-hoc-phan.xlsx',
    title: 'Lớp học phần',
  },
  roadmaps: {
    url: '/templates/mau-nhap-lo-trinh.xlsx',
    fileName: 'mau-nhap-lo-trinh.xlsx',
    title: 'Lộ trình đào tạo',
  },
  studentGroups: {
    url: '/templates/mau-nhap-lop-sinh-vien.xlsx',
    fileName: 'mau-nhap-lop-sinh-vien.xlsx',
    title: 'Lớp sinh viên',
  },
}

export function getImportTemplate(key) {
  return IMPORT_TEMPLATES[key] || null
}
