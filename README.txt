MỘC 1999 – CHẤM CÔNG ĐA CÔNG TRÌNH + QR + GPS

Tính năng:
- Nhiều công trình, mỗi công trình có tên/địa chỉ/tọa độ/bán kính GPS.
- Nhân viên đăng nhập bằng mã + mật khẩu.
- Quét QR tại công trình để nhận token; QR đổi mỗi 30 giây.
- VÀO CA / RA CA chỉ hợp lệ khi QR còn hạn và GPS nằm trong bán kính công trình.
- Ghi lại công trình, ngày, giờ vào/ra và tọa độ.
- Quản lý thêm nhân viên/công trình.
- Báo cáo tháng và xuất CSV.
- SQLite dùng chung khi triển khai một server.

CHẠY LOCAL:
1. Cài Node.js 20+.
2. Giải nén.
3. Mở Terminal tại thư mục.
4. npm install
5. npm start
6. Mở http://localhost:3000

Mặc định:
ADMIN_KEY=MOC1999-ADMIN
Mật khẩu nhân viên mẫu khi tạo: 123456

LƯU Ý QR:
- Bản này dùng QR động. QR phải được hiển thị ở đúng công trình.
- QR trong giao diện quản lý được tạo qua dịch vụ QR image bên ngoài để dễ dùng; khi triển khai sản xuất nên thay bằng QR render nội bộ nếu cần.
- Tham số ?qr=... được đưa vào URL sau khi nhân viên quét. Nhân viên vẫn phải đăng nhập và bật GPS.
- Đừng gửi ảnh QR cho nhân viên từ xa.

TẠO CÔNG TRÌNH:
Ví dụ:
Tên: Homestay A
Địa chỉ: ...
Lat/Lng: lấy từ Google Maps
Bán kính: 100–300m tùy thực tế.

RENDER:
- Có thể deploy Node.js app.
- Đặt biến môi trường ADMIN_KEY.
- Nếu dùng persistent disk, đặt DB_FILE=/var/data/moc1999.db.
- Start command: npm start.
- Nếu dùng nhiều server/instance, nên chuyển SQLite sang PostgreSQL/Supabase.

BẢO MẬT:
- Đổi ADMIN_KEY trước khi dùng thật.
- Đổi mật khẩu mặc định của nhân viên.
- Dùng HTTPS khi triển khai công khai.
