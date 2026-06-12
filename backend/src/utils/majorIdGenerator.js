function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function listSameCodeMajorIds(majorCode, existingIds) {
    const code = String(majorCode || '').trim();
    if (!code) {
        return [];
    }

    const suffixPattern = new RegExp(`^${escapeRegExp(code)}\\.(\\d+)$`);
    const matches = [];

    for (const id of existingIds) {
        const normalizedId = String(id).trim();
        if (normalizedId === code) {
            matches.push(normalizedId);
            continue;
        }

        if (suffixPattern.test(normalizedId)) {
            matches.push(normalizedId);
        }
    }

    return matches.sort();
}

function maxNumericSuffix(majorCode, sameCodeIds) {
    const code = String(majorCode || '').trim();
    const suffixPattern = new RegExp(`^${escapeRegExp(code)}\\.(\\d+)$`);
    let maxSuffix = 0;

    for (const id of sameCodeIds) {
        if (id === code) {
            maxSuffix = Math.max(maxSuffix, 1);
            continue;
        }

        const match = String(id).match(suffixPattern);
        if (match) {
            maxSuffix = Math.max(maxSuffix, parseInt(match[1], 10));
        }
    }

    return maxSuffix;
}

function formatMajorIdSuffix(majorCode, suffix) {
    return `${String(majorCode || '').trim()}.${String(suffix).padStart(2, '0')}`;
}

function generateMajorId(majorCode, _majorName, existingIds) {
    const code = String(majorCode || '').trim();
    if (!code) {
        return 'NGANH';
    }

    const sameCodeIds = listSameCodeMajorIds(code, existingIds);
    if (sameCodeIds.length === 0) {
        return code;
    }

    const nextSuffix = maxNumericSuffix(code, sameCodeIds) + 1;
    let candidate = formatMajorIdSuffix(code, nextSuffix);
    let counter = nextSuffix;

    while (existingIds.has(candidate)) {
        counter += 1;
        candidate = formatMajorIdSuffix(code, counter);
    }

    return candidate;
}

function findBareMajorId(majorCode, existingIds) {
    const code = String(majorCode || '').trim();
    return existingIds.has(code) ? code : null;
}

function promoteBareMajorIdInSet(majorCode, existingIds) {
    const bareId = findBareMajorId(majorCode, existingIds);
    if (!bareId) {
        return null;
    }

    const suffixedId = formatMajorIdSuffix(majorCode, 1);
    existingIds.delete(bareId);
    existingIds.add(suffixedId);

    return { from: bareId, to: suffixedId };
}

module.exports = {
    formatMajorIdSuffix,
    generateMajorId,
    findBareMajorId,
    listSameCodeMajorIds,
    maxNumericSuffix,
    promoteBareMajorIdInSet,
};
