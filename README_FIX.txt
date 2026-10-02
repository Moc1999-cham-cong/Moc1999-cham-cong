MỘC 1999 – BẢN SỬA LỖI RENDER

Lỗi cũ: Render chạy server nhưng báo ENOENT ... /public và trang / hiện Not Found.

Bản này đã sửa server để:
- Có thư mục public/index.html.
- Nếu public/index.html bị thiếu, / vẫn trả trang hướng dẫn thay vì Not Found.
- Start command dùng npm start -> node server.js.

Cách cập nhật GitHub:
1. Mở repository Moc1999-cham-cong/Moc1999-cham-cong.
2. Chọn Add file -> Upload files.
3. Giải nén ZIP này trên máy.
4. Upload TOÀN BỘ 5 file/thư mục ở cấp gốc: server.js, package.json, render.yaml, public/index.html, README_FIX.txt.
5. Commit changes vào branch main.
6. Render sẽ tự deploy lại.
7. Chờ trạng thái Live rồi mở link Render.

Lưu ý: Không xóa database trên Render. Nếu Render hỏi ghi đè file, hãy cập nhật code chứ không xóa service.


BẢN QR SỬA LỖI 2:
- QR không còn phụ thuộc vào việc trình duyệt hiển thị data URL từ JSON.
- Server có endpoint /api/qr-image trả ảnh PNG trực tiếp.
- Trang quản lý tải ảnh QR trực tiếp và tự đổi mỗi 30 giây.
- Bật trust proxy để link QR trên Render dùng HTTPS đúng.
