const xlsx = require('xlsx');

function buildCredentialRows(created = []) {
    return created.map((row, index) => ({
        STT: index + 1,
        'Mã đơn vị': row.scope_unit_id || row.unit_id || '',
        'Tên đơn vị': row.unit_name || '',
        'Loại đơn vị': row.unit_type || '',
        'Vai trò': row.role_label || row.role || '',
        'Họ tên hiển thị': row.full_name || '',
        'Email đăng nhập': row.email || '',
        'Mật khẩu': row.password || '',
        'Ghi chú': row.updated ? 'Cập nhật mật khẩu' : 'Tài khoản mới',
    }));
}

function workbookFromCredentials(created, meta = {}) {
    const sheetRows = buildCredentialRows(created);
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(sheetRows);

    ws['!cols'] = [
        { wch: 6 },
        { wch: 14 },
        { wch: 42 },
        { wch: 14 },
        { wch: 22 },
        { wch: 36 },
        { wch: 32 },
        { wch: 18 },
        { wch: 16 },
    ];

    xlsx.utils.book_append_sheet(wb, ws, 'Tai_khoan');

    if (meta.excluded?.length) {
        const excludedRows = meta.excluded.map((row, index) => ({
            STT: index + 1,
            'Mã đơn vị': row.unit_id,
            'Tên đơn vị': row.unit_name,
            'Lý do không tạo': row.reason,
        }));
        const wsExcluded = xlsx.utils.json_to_sheet(excludedRows);
        xlsx.utils.book_append_sheet(wb, wsExcluded, 'Khong_tao');
    }

    return wb;
}

function bufferFromCredentials(created, meta = {}) {
    const wb = workbookFromCredentials(created, meta);
    return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
    buildCredentialRows,
    bufferFromCredentials,
};
