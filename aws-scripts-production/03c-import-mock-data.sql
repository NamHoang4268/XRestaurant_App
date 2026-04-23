-- ============================================================================
-- File: 03c-import-mock-data.sql
-- Description: Mock data for XRestaurant (Vietnamese restaurant)
-- Author: Kiro AI Assistant
-- Date: 2026-04-17
-- ============================================================================

-- ============================================================================
-- 1. CATEGORIES
-- ============================================================================
INSERT INTO categories (name, description, image) VALUES
('Món chính', 'Các món ăn chính của nhà hàng', 'https://images.unsplash.com/photo-1504674900247-0877df9cc836'),
('Khai vị', 'Món khai vị truyền thống Việt Nam', 'https://images.unsplash.com/photo-1559847844-5315695dadae'),
('Đồ uống', 'Nước giải khát và đồ uống', 'https://images.unsplash.com/photo-1544145945-f90425340c7e'),
('Tráng miệng', 'Món tráng miệng ngọt ngào', 'https://images.unsplash.com/photo-1488477181946-6428a0291777'),
('Lẩu', 'Các loại lẩu đặc sản', 'https://images.unsplash.com/photo-1585032226651-759b368d7246');

-- ============================================================================
-- 2. PRODUCTS
-- ============================================================================
INSERT INTO products (name, description, price, image, category, stock, unit, tags, is_available) VALUES
-- Món chính
('Phở Bò Tái', 'Phở bò truyền thống với thịt bò tái', 65000, 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43', 'Món chính', 100, 'tô', ARRAY['popular', 'traditional'], true),
('Bún Chả Hà Nội', 'Bún chả nướng than hoa đặc trưng Hà Nội', 70000, 'https://images.unsplash.com/photo-1559314809-0d155014e29e', 'Món chính', 80, 'phần', ARRAY['popular', 'grilled'], true),
('Cơm Tấm Sườn Nướng', 'Cơm tấm với sườn nướng thơm ngon', 60000, 'https://images.unsplash.com/photo-1603133872878-684f208fb84b', 'Món chính', 90, 'phần', ARRAY['popular'], true),
('Bánh Xèo Miền Tây', 'Bánh xèo giòn rụm với nhân tôm thịt', 55000, 'https://images.unsplash.com/photo-1626804475297-41608ea09aeb', 'Món chính', 70, 'phần', ARRAY['crispy', 'traditional'], true),
('Mì Quảng', 'Mì Quảng đặc sản miền Trung', 65000, 'https://images.unsplash.com/photo-1569562211093-4ed0d0758f12', 'Món chính', 60, 'tô', ARRAY['traditional'], true),

-- Khai vị
('Gỏi Cuốn Tôm Thịt', 'Gỏi cuốn tươi với tôm và thịt', 45000, 'https://images.unsplash.com/photo-1559314809-0d155014e29e', 'Khai vị', 100, 'phần', ARRAY['fresh', 'healthy'], true),
('Nem Rán', 'Nem rán giòn với nhân thịt và rau củ', 40000, 'https://images.unsplash.com/photo-1626804475297-41608ea09aeb', 'Khai vị', 80, 'phần', ARRAY['crispy', 'fried'], true),
('Chả Giò', 'Chả giò truyền thống miền Nam', 40000, 'https://images.unsplash.com/photo-1626804475297-41608ea09aeb', 'Khai vị', 80, 'phần', ARRAY['crispy'], true),

-- Đồ uống
('Trà Đá', 'Trà đá truyền thống', 10000, 'https://images.unsplash.com/photo-1556679343-c7306c1976bc', 'Đồ uống', 200, 'ly', ARRAY['cold'], true),
('Cà Phê Sữa Đá', 'Cà phê sữa đá đậm đà', 25000, 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735', 'Đồ uống', 150, 'ly', ARRAY['coffee', 'cold'], true),
('Nước Chanh Dây', 'Nước chanh dây tươi mát', 30000, 'https://images.unsplash.com/photo-1523677011781-c91d1bbe2f9d', 'Đồ uống', 120, 'ly', ARRAY['fresh', 'cold'], true),
('Sinh Tố Bơ', 'Sinh tố bơ béo ngậy', 35000, 'https://images.unsplash.com/photo-1505252585461-04db1eb84625', 'Đồ uống', 100, 'ly', ARRAY['smoothie', 'creamy'], true),

-- Tráng miệng
('Chè Ba Màu', 'Chè ba màu truyền thống', 25000, 'https://images.unsplash.com/photo-1563805042-7684c019e1cb', 'Tráng miệng', 80, 'chén', ARRAY['sweet', 'traditional'], true),
('Bánh Flan', 'Bánh flan caramel mềm mịn', 20000, 'https://images.unsplash.com/photo-1488477181946-6428a0291777', 'Tráng miệng', 90, 'phần', ARRAY['sweet'], true),
('Chè Thái', 'Chè Thái với nhiều loại trái cây', 30000, 'https://images.unsplash.com/photo-1563805042-7684c019e1cb', 'Tráng miệng', 70, 'chén', ARRAY['sweet', 'fruit'], true),

-- Lẩu
('Lẩu Thái Hải Sản', 'Lẩu Thái chua cay với hải sản tươi', 350000, 'https://images.unsplash.com/photo-1585032226651-759b368d7246', 'Lẩu', 30, 'nồi', ARRAY['spicy', 'seafood', 'hot'], true),
('Lẩu Bò Nhúng Dấm', 'Lẩu bò nhúng dấm đặc sản miền Nam', 320000, 'https://images.unsplash.com/photo-1585032226651-759b368d7246', 'Lẩu', 25, 'nồi', ARRAY['beef', 'hot'], true),
('Lẩu Gà Lá É', 'Lẩu gà lá é thơm ngon bổ dưỡng', 300000, 'https://images.unsplash.com/photo-1585032226651-759b368d7246', 'Lẩu', 20, 'nồi', ARRAY['chicken', 'hot', 'healthy'], true);

-- ============================================================================
-- 3. TABLES
-- ============================================================================
INSERT INTO tables (table_number, capacity, status, location) VALUES
('T01', 2, 'available', 'indoor'),
('T02', 2, 'available', 'indoor'),
('T03', 4, 'available', 'indoor'),
('T04', 4, 'occupied', 'indoor'),
('T05', 4, 'available', 'indoor'),
('T06', 6, 'available', 'indoor'),
('T07', 6, 'reserved', 'indoor'),
('T08', 8, 'available', 'vip'),
('T09', 4, 'available', 'outdoor'),
('T10', 4, 'available', 'outdoor');

-- ============================================================================
-- 4. USERS
-- ============================================================================
INSERT INTO users (name, email, phone, role, is_active) VALUES
('Admin User', 'admin@xrestaurant.com', '0901234567', 'admin', true),
('Nhân viên Nguyễn Văn A', 'staff1@xrestaurant.com', '0902345678', 'staff', true),
('Nhân viên Trần Thị B', 'staff2@xrestaurant.com', '0903456789', 'staff', true),
('Khách hàng Lê Văn C', 'customer1@gmail.com', '0904567890', 'customer', true),
('Khách hàng Phạm Thị D', 'customer2@gmail.com', '0905678901', 'customer', true);

-- ============================================================================
-- 5. ORDERS (Sample orders)
-- ============================================================================
INSERT INTO orders (order_number, customer_name, customer_phone, table_number, subtotal, tax, total, status, payment_status, created_at) VALUES
('ORD-001', 'Nguyễn Văn E', '0906789012', 'T04', 200000, 20000, 220000, 'completed', 'paid', NOW() - INTERVAL '2 hours'),
('ORD-002', 'Trần Thị F', '0907890123', 'T07', 350000, 35000, 385000, 'preparing', 'unpaid', NOW() - INTERVAL '30 minutes'),
('ORD-003', 'Lê Văn G', '0908901234', 'T03', 150000, 15000, 165000, 'pending', 'unpaid', NOW() - INTERVAL '10 minutes');

-- ============================================================================
-- 6. ORDER_ITEMS
-- ============================================================================
-- Order 1 items
INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity, subtotal) VALUES
(1, 1, 'Phở Bò Tái', 65000, 2, 130000),
(1, 10, 'Cà Phê Sữa Đá', 25000, 2, 50000),
(1, 7, 'Nem Rán', 40000, 1, 40000);

-- Order 2 items
INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity, subtotal) VALUES
(2, 16, 'Lẩu Thái Hải Sản', 350000, 1, 350000);

-- Order 3 items
INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity, subtotal) VALUES
(3, 2, 'Bún Chả Hà Nội', 70000, 2, 140000),
(3, 9, 'Trà Đá', 10000, 2, 20000);

-- ============================================================================
-- 7. BOOKINGS
-- ============================================================================
INSERT INTO bookings (customer_name, phone, email, booking_date, booking_time, guests, table_number, status, notes) VALUES
('Nguyễn Văn H', '0909012345', 'customer3@gmail.com', CURRENT_DATE + INTERVAL '1 day', '18:00:00', 4, 'T06', 'confirmed', 'Đặt bàn sinh nhật'),
('Trần Thị I', '0910123456', 'customer4@gmail.com', CURRENT_DATE + INTERVAL '2 days', '19:00:00', 6, 'T08', 'pending', 'Tiệc công ty'),
('Lê Văn K', '0911234567', 'customer5@gmail.com', CURRENT_DATE, '20:00:00', 2, 'T01', 'confirmed', NULL);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Count records
SELECT 'categories' as table_name, COUNT(*) as count FROM categories
UNION ALL
SELECT 'products', COUNT(*) FROM products
UNION ALL
SELECT 'tables', COUNT(*) FROM tables
UNION ALL
SELECT 'users', COUNT(*) FROM users
UNION ALL
SELECT 'orders', COUNT(*) FROM orders
UNION ALL
SELECT 'order_items', COUNT(*) FROM order_items
UNION ALL
SELECT 'bookings', COUNT(*) FROM bookings
ORDER BY table_name;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '✅ Mock data imported successfully!';
    RAISE NOTICE '📊 Data summary:';
    RAISE NOTICE '   - 5 categories';
    RAISE NOTICE '   - 18 products';
    RAISE NOTICE '   - 10 tables';
    RAISE NOTICE '   - 5 users';
    RAISE NOTICE '   - 3 orders with items';
    RAISE NOTICE '   - 3 bookings';
    RAISE NOTICE '🎯 Ready for testing!';
END $$;
