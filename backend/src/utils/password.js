const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const SALT_ROUNDS = 10;

async function hashPassword(plain) {
    return bcrypt.hash(plain, SALT_ROUNDS);
}

async function verifyPassword(plain, hash) {
    return bcrypt.compare(plain, hash);
}

/** Mật khẩu tạm — hiển thị một lần cho Ban Đào tạo cấp cho đơn vị. */
function generateTemporaryPassword(length = 12) {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const special = '!@#';
    const all = upper + lower + digits + special;

    const pick = (chars) => chars[crypto.randomInt(0, chars.length)];
    const required = [pick(upper), pick(lower), pick(digits), pick(special)];
    const rest = Array.from({ length: length - required.length }, () => pick(all));
    const combined = [...required, ...rest];

    for (let i = combined.length - 1; i > 0; i -= 1) {
        const j = crypto.randomInt(0, i + 1);
        [combined[i], combined[j]] = [combined[j], combined[i]];
    }

    return combined.join('');
}

module.exports = {
    hashPassword,
    verifyPassword,
    generateTemporaryPassword,
};
