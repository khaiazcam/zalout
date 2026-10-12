# Zalo – Rời nhóm hàng loạt

Chrome extension rời lần lượt các nhóm trong kết quả tìm kiếm của Zalo Web (chat.zalo.me).

## Cài đặt
1. Mở `chrome://extensions`, bật **Developer mode**.
2. Bấm **Load unpacked**, chọn thư mục này.
3. Mở/tải lại https://chat.zalo.me – bảng "Rời nhóm hàng loạt" hiện ở giữa lệch trái
   (kéo thanh tiêu đề để di chuyển, bấm icon extension để ẩn/hiện).

## Sử dụng
1. Gõ từ khóa có trong tên nhóm vào ô tìm kiếm của Zalo.
2. Bấm **Bắt đầu**. Extension:
   - bấm "Xem tất cả liên hệ" → "Xem tất cả nhóm", cuộn hết danh sách và liệt kê các **nhóm** (bỏ qua liên hệ cá nhân);
   - hỏi xác nhận, rồi với từng nhóm: mở nhóm → mở Thông tin nhóm → cuộn xuống cuối → bấm **Rời nhóm**
     → bật **Rời nhóm trong im lặng** → bấm **Rời nhóm**.
3. **Chỉ liệt kê** để xem danh sách mà không rời. **Dừng** để ngắt giữa chừng.

Ghi chú:
- Nhóm mà bạn là **trưởng nhóm** bị bỏ qua (Zalo bắt chọn trưởng nhóm mới); danh sách in ở cuối nhật ký.
- Mặc định nghỉ 3 giây giữa các nhóm, nghỉ 60 giây sau mỗi 20 nhóm; lỗi 5 lần liên tiếp sẽ tự dừng.
- Nhật ký chi tiết có trong bảng và trong Console (tiền tố `[Zalout]`).
