import pandas as pd
from data.db_connector import get_db_connection


def _coerce_numeric_columns(df, columns):
    for column in columns:
        if column in df.columns:
            df[column] = pd.to_numeric(df[column], errors='coerce').fillna(0)
    return df

class DataLoader:
    def __init__(self):
        self.conn = get_db_connection()

    def get_semester_dates(self, semester_id):
        """Return semester start/end dates from DB; no synthetic fallback."""
        query = """
            SELECT start_date, end_date
            FROM semesters
            WHERE semester_id = %s
        """
        try:
            with self.conn.cursor() as cursor:
                cursor.execute(query, (semester_id,))
                row = cursor.fetchone()
            if not row:
                return None, None
            return row.get('start_date'), row.get('end_date')
        except Exception as e:
            print(f"Lỗi khi truy vấn ngày học kỳ: {e}")
            return None, None

    def get_course_sections(self, semester_id):
        """Lấy danh sách lớp học phần KÈM THEO danh sách lớp sinh viên (Student Groups)"""
        query_sections = """
            SELECT 
                cs.section_id, cs.course_id, cs.lecturer_id, cs.class_type, cs.capacity,
                cs.room_type_req,
                c.theory_credits, c.practice_credits,
                COALESCE(c.default_room_type, c.room_type, 'LT') AS course_default_room_type
            FROM course_sections cs
            JOIN courses c ON cs.course_id = c.course_id
            WHERE cs.semester_id = %s
        """
        
        # Bảng ẩn của Prisma luôn có tên định dạng này, cột "A" là section_id, "B" là group_id
        query_groups = """
            SELECT "A" as section_id, "B" as group_id
            FROM "_CourseSectionToStudentGroup"
        """
        
        try:
            with self.conn.cursor() as cursor:
                # 1. Lấy thông tin Lớp học phần
                cursor.execute(query_sections, (semester_id,))
                sections = cursor.fetchall()
                df_sections = pd.DataFrame(sections)
                
                if df_sections.empty:
                    return df_sections

                # 2. Lấy thông tin mapping Nhóm sinh viên
                cursor.execute(query_groups)
                groups_mapping = cursor.fetchall()
                df_groups = pd.DataFrame(groups_mapping)
                
                # 3. Gộp nhóm sinh viên vào df_sections (dạng list)
                if not df_groups.empty:
                    # Gom nhóm các group_id theo section_id
                    groups_agg = df_groups.groupby('section_id')['group_id'].apply(list).reset_index()
                    df_sections = pd.merge(df_sections, groups_agg, on='section_id', how='left')
                else:
                    df_sections['group_id'] = [[] for _ in range(len(df_sections))]
                    
                # Điền danh sách rỗng cho các lớp không gán group_id (để tránh lỗi NaN)
                df_sections['group_id'] = df_sections['group_id'].apply(lambda d: d if isinstance(d, list) else [])

                if 'room_type_req' in df_sections.columns:
                    df_sections['room_type_req'] = (
                        df_sections['room_type_req']
                        .fillna(df_sections.get('course_default_room_type'))
                        .fillna('LT')
                        .astype(str)
                        .str.strip()
                        .str.upper()
                    )
                elif 'course_default_room_type' in df_sections.columns:
                    df_sections['room_type_req'] = (
                        df_sections['course_default_room_type']
                        .fillna('LT')
                        .astype(str)
                        .str.strip()
                        .str.upper()
                    )
                else:
                    df_sections['room_type_req'] = 'LT'

                df_sections = _coerce_numeric_columns(
                    df_sections,
                    ['capacity', 'theory_credits', 'practice_credits'],
                )

            return df_sections
        except Exception as e:
            print(f"Lỗi khi truy vấn: {e}")
            return pd.DataFrame()
    
    def get_rooms(self):
        """Lấy danh sách phòng học từ Database"""
        query = "SELECT room_id, capacity, room_type FROM rooms"
        try:
            with self.conn.cursor() as cursor:
                cursor.execute(query)
                rows = cursor.fetchall()
            df_rooms = pd.DataFrame(rows)
            if df_rooms.empty:
                return df_rooms

            df_rooms = _coerce_numeric_columns(df_rooms, ['capacity'])
            if 'room_type' in df_rooms.columns:
                df_rooms['room_type'] = (
                    df_rooms['room_type']
                    .astype(str)
                    .str.strip()
                    .str.upper()
                )
            return df_rooms
        except Exception as e:
            print(f"Lỗi khi truy vấn phòng học: {e}")
            return pd.DataFrame()
    
    def save_timetables(self, df_result, df_events, semester_id):
        """Replace semester timetables: delete all old rows, then insert new results."""
        if df_result.empty:
            return False

        # Merge với df_events để lấy lại section_id và duration (period_count) gốc
        df_final = pd.merge(df_result, df_events[['event_id', 'section_id', 'duration']], on='event_id', how='left')

        start_date, end_date = self.get_semester_dates(semester_id)
        if not start_date or not end_date:
            print(f"Học kỳ {semester_id} chưa có ngày bắt đầu/kết thúc hợp lệ. Không lưu TKB.")
            return False

        insert_query = """
            INSERT INTO timetables (section_id, room_id, day_of_week, start_period, period_count, start_date, end_date)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """
        
        try:
            with self.conn.cursor() as cursor:
                cursor.execute(
                    """
                    DELETE FROM timetables t
                    USING course_sections cs
                    WHERE t.section_id = cs.section_id
                      AND cs.semester_id = %s
                    """,
                    (semester_id,),
                )

                for _, row in df_final.iterrows():
                    cursor.execute(insert_query, (
                        row['section_id'],
                        row['room_id'],
                        row['day'],
                        row['start_period'],
                        row['duration'],
                        start_date,
                        end_date,
                    ))
            
            # Phải có commit thì PostgreSQL mới thực sự lưu xuống ổ cứng
            self.conn.commit()
            return True
        except Exception as e:
            print(f"Lỗi khi lưu kết quả vào DB: {e}")
            self.conn.rollback()
            return False

    def close(self):
        if self.conn:
            self.conn.close()