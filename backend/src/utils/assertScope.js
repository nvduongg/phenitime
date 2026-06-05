function assertUnitInScope(req, unitId) {
    if (!req.scopeUnitIds) {
        return true;
    }
    return req.scopeUnitIds.includes(unitId);
}

function scopeForbiddenResponse(res) {
    return res.status(403).json({
        status: 'error',
        message: 'Đơn vị không thuộc phạm vi quản lý của tài khoản',
    });
}

module.exports = {
    assertUnitInScope,
    scopeForbiddenResponse,
};
