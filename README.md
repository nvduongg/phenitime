# Phenitime

Hệ thống hỗ trợ **sinh lớp học phần** và **xếp thời khóa biểu (TKB)** cho đào tạo đại học, tuân thủ quy định khối lượng giảng dạy (QĐ 1062), nhịp học theo giai đoạn, và ràng buộc phòng — giảng viên — nhóm sinh viên.

## Kiến trúc

| Thành phần | Công nghệ | Vai trò |
|------------|-----------|---------|
| `frontend/` | React 19, Vite, Ant Design | Giao diện quản trị, dashboard, xuất Excel, xếp tay TKB |
| `backend/` | Node.js, Express, Prisma, BullMQ | REST API, nghiệp vụ, hàng đợi xếp lịch bất đồng bộ |
| `core/` | Python, FastAPI, OR-Tools CP-SAT | Engine xếp TKB (3 phase: cứng → nới lỏng → LNS) |
| `compose.yaml` | Docker Compose | Hạ tầng local nội bộ: Postgres, Redis, Core, Backend, Frontend nginx |

```
Frontend (8080 hoặc 5173) ──► Backend (5000) ──► PostgreSQL
                        │
                        ├──► Redis ◄── BullMQ worker
                        └──► Core API (8000) /solve
```

## Yêu cầu hệ thống

- Node.js 20+
- Python 3.11+ (khuyến nghị 3.12+)
- Docker & Docker Compose (PostgreSQL + Redis)
- npm hoặc pnpm

## Cài đặt nhanh

### Chạy toàn bộ bằng Docker Compose

Yêu cầu: Docker & Docker Compose.

```bash
cp .env.example .env
docker compose up -d --build
```

Hoặc dùng script (tự tạo `.env` nếu chưa có):

```bash
./scripts/docker-up.sh
```

Sau khi các container healthy, mở http://localhost:8080 và đăng nhập (tài khoản admin tự tạo khi backend khởi động lần đầu):

| | |
|--|--|
| Email | `admin@phenikaa-uni.edu.vn` (đổi bằng `SEED_ADMIN_EMAIL` trong `.env`) |
| Mật khẩu | `Phenitime@2026` (đổi bằng `SEED_ADMIN_PASSWORD`) |

**Không cần** vào thư mục `backend/` chạy `prisma migrate` hay `npm run seed` khi dùng Docker — container backend tự migrate DB và tạo admin (xem `docker-entrypoint.sh` + khởi động server).

| Dịch vụ | URL |
|---------|-----|
| Giao diện web | http://localhost:8080 (đổi bằng `APP_PORT` trong `.env`) |
| Backend API (nội bộ) | proxy qua nginx tại `/api/v1` |

Nạp thêm dữ liệu demo (chỉ khi cần, tùy chọn — hiện `seed` cũng chỉ đảm bảo đơn vị gốc + admin):

```bash
docker compose exec backend npm run seed
```

File mẫu import Excel (`frontend/public/templates/`) **không** nằm trên git; Docker tự sinh khi build image frontend. Khi chạy thủ công ngoài Docker, chạy `cd backend && npm run generate:templates` trước khi cần nút “Tải file mẫu”.

Xem log: `docker compose logs -f` — Dừng: `docker compose down`

> **Lưu ý:** Khi chạy Docker, `compose.yaml` tự inject `DATABASE_URL`, `REDIS_HOST`, `AI_CORE_URL` cho backend/core. Không cần `backend/.env` riêng trừ khi phát triển local không qua container.

### Cài đặt thủ công (phát triển)

#### 0. Biến môi trường (lần đầu)

```bash
cp .env.example .env              # Docker Compose (PostgreSQL, Redis)
cp backend/.env.example backend/.env
cp core/.env.example core/.env
```

`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` trong `.env` gốc phải **khớp** với `DATABASE_URL` ở `backend/.env` và `core/.env`. Không commit file `.env` thật.

### 1. Hạ tầng (PostgreSQL + Redis)

```bash
docker compose up -d
```

### 2. Backend

```bash
cd backend
cp .env.example .env   # chỉnh DATABASE_URL, REDIS_*, AI_CORE_URL nếu cần
npm install
npx prisma migrate deploy
npm run seed           # tùy chọn — dữ liệu mẫu
npm run dev            # http://localhost:5000
```

### 3. Core engine (Python)

```bash
cd core
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # DATABASE_URL trùng backend
uvicorn api.server:app --host 0.0.0.0 --port 8000 --reload
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

## Biến môi trường

### `.env` (thư mục gốc — Docker Compose)

| Biến | Mô tả | Mặc định |
|------|--------|----------|
| `POSTGRES_USER` | User PostgreSQL | `phenitime_user` |
| `POSTGRES_PASSWORD` | Mật khẩu PostgreSQL | *(đặt trong .env, không commit)* |
| `POSTGRES_DB` | Tên database | `phenitime_db` |
| `POSTGRES_PORT` | Port host → container | `5432` |
| `REDIS_PORT` | Port Redis | `6379` |

### `backend/.env`

| Biến | Mô tả | Ví dụ |
|------|--------|-------|
| `DATABASE_URL` | PostgreSQL (Prisma) | `postgresql://phenitime_user:phenitime_pass@localhost:5432/phenitime_db?schema=public` |
| `PORT` | Cổng API Node | `5000` |
| `REDIS_HOST` | Redis cho BullMQ | `127.0.0.1` |
| `REDIS_PORT` | Cổng Redis | `6379` |
| `AI_CORE_URL` | URL engine Python | `http://localhost:8000` |
| `SOLVER_HTTP_TIMEOUT_MS` | Timeout gọi solver (`0` = không giới hạn) | `0` |

### `core/.env`

| Biến | Mô tả |
|------|--------|
| `DATABASE_URL` | Cùng chuỗi kết nối PostgreSQL với backend (nếu engine đọc DB trực tiếp) |

## Quy trình sử dụng chính

1. **Master data** — đơn vị, học kỳ, phòng, giảng viên, học phần.
2. **Chương trình & nhóm SV** — CTĐT, nhóm sinh viên theo khóa.
3. **Phân công GV** — gán giảng viên cho học phần / lớp.
4. **Sinh lớp học phần** — tự động theo template (STANDARD, LAB_COUPLED, ONLINE, …).
5. **AI xếp TKB** — chạy qua hàng đợi; kết quả lưu DB + danh sách buổi chưa xếp.
6. **Thời khóa biểu** — xem lưới, kéo-thả xếp tay phần còn lại, xuất Excel.

## Thuật toán xếp lịch (tóm tắt)

- **Phase 1** — Ràng buộc cứng (phòng, GV, nhóm SV, HC6/HC7), tối đa hóa số buổi xếp được.
- **Phase 2** — Nới lỏng có phạt (phòng chật, GV quá tải, trùng ca cùng section).
- **Phase 3 (LNS)** — Gỡ khóa cụm lân cận các buổi chưa xếp, giải lại cục bộ để nhét thêm khi lưới gần kín.

Nhịp học: môn 45 tiết có thể **5 tuần × 3 tiết + 5 tuần × 6 tiết** (2 buổi × 3 tiết/tuần ở giai đoạn sau).

## Cấu trúc thư mục

```
phenitime/
├── backend/          # API Node + Prisma + BullMQ worker
├── core/             # FastAPI + CP-SAT scheduler
├── frontend/         # React UI
├── compose.yaml      # PostgreSQL + Redis
├── data/             # Dữ liệu local (gitignored)
├── reports/          # Báo cáo / luận văn (gitignored)
├── paper_vnict/      # Paper nội bộ (gitignored)
└── IEEECS_CPS_2026/  # Paper hội nghị (gitignored)
```

## Scripts hữu ích

```bash
# Backend
npm run seed                    # Seed dữ liệu mẫu
npm run generate:templates      # Tạo file Excel mẫu import → frontend/public/templates/ (gitignored)
npx prisma studio               # Xem DB trực quan

# Frontend
npm run build                   # Build production → frontend/dist/
npm run lint
```

## Ghi chú phát triển

- API backend: `http://localhost:5000/api/v1`
- Core solver: `POST http://localhost:8000/api/v1/solve`
- Health check: `GET http://localhost:5000/api/health`
- Thư mục `frontend/dist/`, `node_modules/`, `venv/`, `.env` **không** commit (xem `.gitignore`).
- Paper LaTeX (`reports/`, `paper_vnict/`, `IEEECS_CPS_2026/`) và dữ liệu thô `data/` được loại khỏi git.

## License

Dự án đồ án tốt nghiệp — chỉnh sửa và sử dụng theo quy định của nhóm / trường.
