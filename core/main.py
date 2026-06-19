import os
import sys
from data.data_loader import DataLoader
from algorithms.event_generator import EventGenerator
from algorithms.scheduler import TimetableScheduler # Khai báo class mới

def main():
    print("==================================================")
    print("🚀 Phenitime Core Engine - Bắt đầu dựng thuật toán")
    print("==================================================")
    
    loader = DataLoader()
    generator = EventGenerator()
    semester_id = sys.argv[1] if len(sys.argv) > 1 else os.getenv("SEMESTER_ID")
    if not semester_id:
        print("⚠ Thiếu SEMESTER_ID. Chạy: python main.py <semester_id> hoặc đặt biến môi trường SEMESTER_ID.")
        loader.close()
        return
    
    # 1. Tải dữ liệu
    df_sections = loader.get_course_sections(semester_id)
    df_rooms = loader.get_rooms()
    
    if df_sections.empty or df_rooms.empty:
        print("⚠ Thiếu dữ liệu Lớp học phần hoặc Phòng học. Dừng thuật toán.")
        loader.close()
        return

    # 2. Băm Sự kiện
    df_events = generator.generate_events(df_sections)
    
    # 3. Kích hoạt Thuật toán AI
    print("\n--- BƯỚC 3: CHẠY THUẬT TOÁN TỐI ƯU ---")
    scheduler = TimetableScheduler(df_events, df_rooms)
    
    # Tạo biến
    scheduler.build_model()
    
    # Nạp Ràng buộc cứng
    scheduler.add_hard_constraints()
    
    # Giải bài toán và xuất kết quả
    df_result = scheduler.solve()
    
    if not df_result.empty:
        print("\n🎉 XẾP LỊCH THÀNH CÔNG! ĐÂY LÀ KẾT QUẢ:")
        print("-" * 60)
        print(df_result.to_string(index=False))
        print("-" * 60)
    else:
        print("\n❌ Không thể tìm được lịch hợp lệ. Hệ thống quá tải hoặc xung đột ràng buộc!")

if __name__ == "__main__":
    main()