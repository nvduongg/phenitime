const multer = require('multer');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    // 1. Kiểm tra theo mimetype (đã mở rộng thêm các định dạng CSV phổ biến)
    const allowedMimes = [
        'application/vnd.ms-excel', 
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
        'text/csv',
        'application/csv',
        'text/plain' // Đôi khi CSV bị nhận thành text thuần
    ];
    
    // 2. Kiểm tra theo đuôi mở rộng của file
    const ext = file.originalname.split('.').pop().toLowerCase();
    const allowedExts = ['csv', 'xls', 'xlsx'];

    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error(`Chỉ cho phép upload file Excel hoặc CSV! Định dạng hiện tại: ${file.mimetype}`), false);
    }
};

const upload = multer({ storage: storage, fileFilter: fileFilter });

module.exports = upload;