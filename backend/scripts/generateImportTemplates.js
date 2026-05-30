const fs = require('fs')
const path = require('path')
const xlsx = require('xlsx')

const OUTPUT_DIR = path.resolve(__dirname, '../../frontend/public/templates')

const TEMPLATE_DEFINITIONS = [
  {
    fileName: 'mau-nhap-hoc-phan.xlsx',
    sheets: [
      {
        name: 'Dữ liệu',
        rows: [
          [
            'Mã học phần',
            'Tên học phần',
            'Tổng tín chỉ',
            'Tín chỉ lý thuyết',
            'Tín chỉ thực hành',
            'Hình thức học',
            'Yêu cầu phòng',
            'Mẫu sinh lớp',
            'Mã khoa quản lý',
          ],
          ['CSE703008', 'Cơ sở dữ liệu', 3, 2, 1, 'OFFLINE', 'PM', 'STANDARD', 'FAD'],
          ['CSE703107', 'Cơ sở lập trình', 3, 2, 1, 'OFFLINE', 'PM', 'LAB_COUPLED', 'FIS'],
          ['CSE703024', 'Toán rời rạc', 3, 3, 0, 'OFFLINE', 'LT', 'STANDARD', 'FCS'],
          ['FBE702001', 'Quản trị học', 2, 2, 0, 'ONLINE_ELEARNING', 'LT', 'STANDARD', 'FBA'],
          ['FEL703001', 'Tiếng Anh 1', 3, 1, 2, 'ONLINE_ELEARNING', 'LT', 'STANDARD', 'FL'],
          ['FTS702001', 'Kỹ năng khởi nghiệp', 2, 1, 1, 'ONLINE_ELEARNING', 'ONLINE', 'ONLINE', 'EIB'],
        ],
      },
      {
        name: 'Hướng dẫn',
        rows: [
          ['Cột', 'Mô tả', 'Bắt buộc'],
          ['Mã học phần', 'Mã duy nhất của học phần (VD: INT3306)', 'Có'],
          ['Tên học phần', 'Tên đầy đủ của học phần', 'Có'],
          ['Tổng tín chỉ', 'Tổng số tín chỉ', 'Có'],
          ['Tín chỉ lý thuyết', 'Số tín chỉ lý thuyết', 'Có'],
          ['Tín chỉ thực hành', 'Số tín chỉ thực hành', 'Có'],
          ['Hình thức học', 'FACE, ELEARNING, COURSERA, HYBRID, SPECIAL hoặc giá trị quen thuộc: OFFLINE, ONLINE_ELEARNING, Coursera, HYBRID, ĐA/TT/KL (mặc định FACE)', 'Không'],
          ['Yêu cầu phòng', 'LT, PM, TN, SB, XT, BV, DN, ONLINE (mặc định LT)', 'Không'],
          ['Mẫu sinh lớp', 'STANDARD | LAB_COUPLED | ONLINE | MEDICAL_CLINIC | SPECIAL (ĐA/TT/KL → SPECIAL)', 'Không'],
          ['Mã khoa quản lý', 'Mã khoa hiện hành trong hệ thống (FIS/FCS/FAD/FL/FBA/EIB…). Không dùng mã cũ CSE/FBE/FEL/FTS hay tiền tố mã học phần.', 'Có'],
          ['', 'VD: CSE703008 → FAD; CSE703107 → FIS; FBE702001 → FBA. Mỗi học phần một mã khoa riêng.', ''],
          ['', 'SPECIAL: không sinh lớp tự động — nhập lớp học phần riêng sau', ''],
        ],
      },
    ],
  },
  {
    fileName: 'mau-nhap-nganh-dao-tao.xlsx',
    sheets: [
      {
        name: 'Dữ liệu',
        rows: [
          ['Mã ngành', 'Tên ngành', 'Mã khoa', 'Mã nội bộ'],
          ['7480201', 'Công nghệ thông tin (Chính quy)', 'F_IT', ''],
          ['7480201', 'Công nghệ thông tin (Liên thông)', 'F_IT', ''],
          ['7340101', 'Quản trị kinh doanh (Chính quy)', 'F_BA', ''],
        ],
      },
      {
        name: 'Hướng dẫn',
        rows: [
          ['Cột', 'Mô tả', 'Bắt buộc'],
          ['Mã ngành', 'Mã ngành quốc gia (VD: 7480201) — nhiều CTĐT có thể dùng chung', 'Có'],
          ['Tên ngành', 'Tên đầy đủ, nên ghi rõ hệ đào tạo trong ngoặc', 'Có'],
          ['Mã khoa', 'Mã đơn vị khoa quản lý (phải tồn tại trong hệ thống)', 'Có'],
          ['Mã nội bộ', 'Để trống để hệ thống tự sinh (VD: 7480201-CQ). Chỉ điền khi cần cố định mã', 'Không'],
        ],
      },
    ],
  },
  {
    fileName: 'mau-nhap-giang-vien.xlsx',
    sheets: [
      {
        name: 'Dữ liệu',
        rows: [
          ['Mã giảng viên', 'Họ tên', 'Mã khoa', 'Định mức', 'Chuyên môn'],
          ['PU1459', 'Nguyễn Văn A', 'KHOA_CNTT', 15, 'INT3306, CS101'],
          ['PU1460', 'Trần Thị B', 'KHOA_CNTT', 15, ''],
        ],
      },
      {
        name: 'Hướng dẫn',
        rows: [
          ['Cột', 'Mô tả', 'Bắt buộc'],
          ['Mã giảng viên', 'Mã duy nhất (VD: PU1459)', 'Có'],
          ['Họ tên', 'Họ và tên giảng viên', 'Có'],
          ['Mã khoa', 'Mã đơn vị khoa/bộ môn quản lý', 'Có'],
          ['Định mức', 'Số tiết/tín chỉ tối đa mỗi học kỳ (mặc định 15)', 'Không'],
          ['Chuyên môn', 'Danh sách mã học phần có thể dạy, phân cách bằng dấu phẩy và khoảng trắng (VD: CSE702003, CSE703008)', 'Không'],
        ],
      },
    ],
  },
  {
    fileName: 'mau-nhap-phong-hoc.xlsx',
    sheets: [
      {
        name: 'Dữ liệu',
        rows: [
          ['Mã phòng', 'Sức chứa', 'Loại phòng'],
          ['A2-102', 80, 'LT'],
          ['PM-201', 40, 'PM'],
          ['LAB-301', 30, 'TN'],
          ['ONLINE', 9999, 'ONLINE'],
        ],
      },
      {
        name: 'Hướng dẫn',
        rows: [
          ['Cột', 'Mô tả', 'Bắt buộc'],
          ['Mã phòng', 'Mã duy nhất của phòng (VD: A2-102)', 'Có'],
          ['Sức chứa', 'Số chỗ ngồi tối đa', 'Có'],
          ['Loại phòng', 'LT, PM, TN, SB, XT, BV, DN, ONLINE', 'Có'],
        ],
      },
    ],
  },
  {
    fileName: 'mau-nhap-lop-hoc-phan.xlsx',
    sheets: [
      {
        name: 'Dữ liệu',
        rows: [
          ['Mã học phần', 'Lớp học phần', 'Giảng viên', 'Hình thức học', 'Số lượng'],
          ['FBE703002', 'An toàn và sức khỏe nghề nghiệp-1-3-25(N01)', 'Đinh Thị Hà - PU1459', 'LT', 80],
          ['PHA703002', 'Bào chế sinh dược học 1-1-3-25(N01.TH1)', 'Nguyễn Thị Hồng Giang - PU0184', 'TH', 22],
        ],
      },
      {
        name: 'Hướng dẫn',
        rows: [
          ['Cột', 'Mô tả', 'Bắt buộc'],
          ['Mã học phần', 'Mã môn học (phải tồn tại trong hệ thống)', 'Có'],
          ['Lớp học phần', 'Mã lớp học phần duy nhất (VD: Tiếng Anh 3-1-3-25(N01))', 'Có'],
          ['Giảng viên', 'Định dạng: Họ tên - Mã GV (VD: Nguyễn Văn A - PU1459)', 'Không'],
          ['Hình thức học', 'LT hoặc TH (mặc định LT)', 'Không'],
          ['Số lượng', 'Sĩ số dự kiến (mặc định 40)', 'Không'],
          ['', 'Lưu ý: Chọn học kỳ trên trang trước khi nhập Excel', ''],
        ],
      },
    ],
  },
  {
    fileName: 'mau-nhap-lo-trinh.xlsx',
    sheets: [
      {
        name: 'Dữ liệu',
        rows: [
          ['Mã học phần', 'Học kỳ', 'Loại môn'],
          ['CSE703001', 1, 'MANDATORY'],
          ['CSE703008', 2, 'MANDATORY'],
          ['CSE703029', 3, 'ELECTIVE'],
        ],
      },
      {
        name: 'Hướng dẫn',
        rows: [
          ['Cột', 'Mô tả', 'Bắt buộc'],
          ['Mã học phần', 'Mã học phần (phải tồn tại trong hệ thống)', 'Có'],
          ['Học kỳ', 'Số thứ tự 1–12 trong CTĐT, 3 kỳ/năm (hiển thị: Kỳ 1 Năm 1...)', 'Có'],
          ['Loại môn', 'MANDATORY (bắt buộc) hoặc ELECTIVE (tự chọn)', 'Không'],
          ['', 'Lưu ý: Mở lộ trình CTĐT trước khi nhập Excel', ''],
        ],
      },
    ],
  },
  {
    fileName: 'mau-nhap-lop-sinh-vien.xlsx',
    sheets: [
      {
        name: 'Dữ liệu',
        rows: [
          ['Mã lớp', 'Mã ngành', 'Niên khóa', 'Sĩ số'],
          ['K16-CNTT_1', '7480201-CNTT', 'K16', 67],
          ['K17-CNTTVJ_1', '7480201-CNTTVN', 'K17', 84],
          ['ICT1.24105.1', '7480201-CNTT', 'K18', 139],
        ],
      },
      {
        name: 'Hướng dẫn',
        rows: [
          ['Cột', 'Mô tả', 'Bắt buộc'],
          ['Mã lớp', 'Mã lớp hành chính (VD: K16-CNTT_1, ICT1.24105.1)', 'Có'],
          ['Mã ngành', 'Mã ngành trong danh mục (VD: 7480201-CNTT)', 'Có'],
          ['Niên khóa', 'Mã niên khóa (VD: K16, K17) — CTĐT tự tạo nếu chưa có', 'Có'],
          ['Sĩ số', 'Số sinh viên trong lớp', 'Không'],
        ],
      },
    ],
  },
]

function buildWorkbook(definition) {
  const workbook = xlsx.utils.book_new()

  definition.sheets.forEach((sheet) => {
    const worksheet = xlsx.utils.aoa_to_sheet(sheet.rows)
    worksheet['!cols'] = sheet.rows[0].map((header) => ({
      wch: Math.max(String(header).length + 4, 16),
    }))
    xlsx.utils.book_append_sheet(workbook, worksheet, sheet.name)
  })

  return workbook
}

function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  TEMPLATE_DEFINITIONS.forEach((definition) => {
    const workbook = buildWorkbook(definition)
    const outputPath = path.join(OUTPUT_DIR, definition.fileName)
    xlsx.writeFile(workbook, outputPath)
    console.log(`Created ${outputPath}`)
  })
}

main()
