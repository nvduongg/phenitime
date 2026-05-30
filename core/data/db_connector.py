import os
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

# Tải biến môi trường từ file .env
load_dotenv()

def get_db_connection():
    """Tạo và trả về đối tượng kết nối với PostgreSQL"""
    try:
        # 1. Lấy chuỗi kết nối gốc
        db_url = os.getenv("DATABASE_URL")
        
        # 2. Xử lý chuỗi: Cắt bỏ phần '?schema=public' (nếu có) vì psycopg2 không hỗ trợ
        if db_url and "?" in db_url:
            db_url = db_url.split("?")[0]

        # 3. Thực hiện kết nối
        conn = psycopg2.connect(
            db_url,
            cursor_factory=RealDictCursor
        )
        return conn
    except Exception as e:
        print(f"Lỗi kết nối Database: {e}")
        return None