function buildMajorLookups(majors) {
    const byId = new Map(majors.map((major) => [major.major_id, major]));
    const byCode = new Map();
    const all = [...majors];

    majors.forEach((major) => {
        const code = String(major.major_code || '').trim();
        if (!code) return;

        if (!byCode.has(code)) {
            byCode.set(code, []);
        }
        byCode.get(code).push(major);
    });

    return { byId, byCode, all };
}

function parseGroupIdParts(groupId) {
    const trimmed = String(groupId || '').trim();

    // K16-CNTT_1, K17-KHMT(AI&KHDL)_1
    const dashWithSeq = trimmed.match(/^([Kk]\d+)-(.+?)_(\d+)$/);
    if (dashWithSeq) {
        return {
            cohortId: dashWithSeq[1].toUpperCase(),
            majorToken: dashWithSeq[2],
        };
    }

    // K16-KHMT(AI&KHDL), K17-KTPM(EL)
    const dashNoSeq = trimmed.match(/^([Kk]\d+)-(.+)$/);
    if (dashNoSeq) {
        return {
            cohortId: dashNoSeq[1].toUpperCase(),
            majorToken: dashNoSeq[2],
        };
    }

    // K17_CNTT_01
    const parts = trimmed.split('_').filter(Boolean);
    if (parts.length >= 2 && /^K\d+$/i.test(parts[0])) {
        return {
            cohortId: parts[0].toUpperCase(),
            majorToken: parts[1],
        };
    }

    return { cohortId: null, majorToken: null };
}

function scoreMajorTokenMatch(major, token) {
    const upperToken = token.toUpperCase();
    const majorId = String(major.major_id || '').toUpperCase();
    const majorCode = String(major.major_code || '').toUpperCase();

    if (majorId === upperToken) return 100;
    if (majorId.endsWith(`-${upperToken}`) || majorId.endsWith(`_${upperToken}`)) return 90;
    if (majorCode === upperToken) return 80;
    if (majorId.includes(upperToken) && upperToken.length >= 3) return 60;

    const nameSlug = String(major.major_name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();
    if (nameSlug.includes(upperToken) && upperToken.length >= 3) return 40;

    return 0;
}

function findMajorsByToken(token, majors) {
    const matches = majors
        .map((major) => ({ major, score: scoreMajorTokenMatch(major, token) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score);

    if (!matches.length) return [];

    const topScore = matches[0].score;
    return matches.filter((item) => item.score === topScore).map((item) => item.major);
}

function resolveMajorRef({ majorRef, internalMajorId, groupId, majorLookups }) {
    const internalId = String(internalMajorId || '').trim();
    if (internalId && majorLookups.byId.has(internalId)) {
        return { majorId: internalId, source: 'manual' };
    }

    const ref = String(majorRef || '').trim();
    if (ref) {
        if (majorLookups.byId.has(ref)) {
            return { majorId: ref, source: 'manual' };
        }

        const codeMatches = majorLookups.byCode.get(ref) || [];
        if (codeMatches.length === 1) {
            return { majorId: codeMatches[0].major_id, source: 'major_code' };
        }
        if (codeMatches.length > 1) {
            return {
                ambiguous: true,
                candidates: codeMatches,
                error: `Mã ngành '${ref}' khớp ${codeMatches.length} chương trình`,
            };
        }

        const tokenMatches = findMajorsByToken(ref, majorLookups.all);
        if (tokenMatches.length === 1) {
            return { majorId: tokenMatches[0].major_id, source: 'token' };
        }
        if (tokenMatches.length > 1) {
            return {
                ambiguous: true,
                candidates: tokenMatches,
                error: `Không phân biệt được ngành từ '${ref}'`,
            };
        }

        return { error: `Không tìm thấy ngành '${ref}'` };
    }

    const { majorToken } = parseGroupIdParts(groupId);
    if (!majorToken) {
        return {
            error: 'Không đọc được ngành từ mã lớp. Nhập cột Mã ngành hoặc dùng dạng K16-CNTT_1',
        };
    }

    const tokenMatches = findMajorsByToken(majorToken, majorLookups.all);
    if (tokenMatches.length === 1) {
        return { majorId: tokenMatches[0].major_id, source: 'group_id' };
    }
    if (tokenMatches.length > 1) {
        return {
            ambiguous: true,
            candidates: tokenMatches,
            error: `Mã lớp '${groupId}' khớp ${tokenMatches.length} ngành — cần chọn thêm`,
        };
    }

    return {
        error: `Không tìm thấy ngành từ mã '${majorToken}' trong '${groupId}'`,
    };
}

async function loadMajorLookups(prisma) {
    const majors = await prisma.major.findMany({
        select: { major_id: true, major_code: true, major_name: true },
    });
    return buildMajorLookups(majors);
}

module.exports = {
    buildMajorLookups,
    parseGroupIdParts,
    resolveMajorRef,
    loadMajorLookups,
};
