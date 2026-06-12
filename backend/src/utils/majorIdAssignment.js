const {
    formatMajorIdSuffix,
    generateMajorId,
    listSameCodeMajorIds,
} = require('./majorIdGenerator');
const { renameMajorId } = require('./majorIdRenamer');

function resolveMajorIdForInsert(normalizedCode, existingIds, pendingInsert, dbMajors) {
    const dbSameCode = dbMajors.filter((major) => major.major_code === normalizedCode);
    const pendingSameCode = pendingInsert.filter((major) => major.major_code === normalizedCode);
    const totalAfterInsert = dbSameCode.length + pendingSameCode.length + 1;

    if (totalAfterInsert === 1) {
        return { majorId: normalizedCode, dbRenames: [] };
    }

    const dbRenames = [];
    const bareDbMajor = dbSameCode.find((major) => major.major_id === normalizedCode);
    if (bareDbMajor) {
        const suffixedId = formatMajorIdSuffix(normalizedCode, 1);
        dbRenames.push({ from: bareDbMajor.major_id, to: suffixedId });
        existingIds.delete(bareDbMajor.major_id);
        existingIds.add(suffixedId);
    }

    const barePendingMajor = pendingSameCode.find((major) => major.major_id === normalizedCode);
    if (barePendingMajor) {
        const suffixedId = formatMajorIdSuffix(normalizedCode, 1);
        existingIds.delete(barePendingMajor.major_id);
        barePendingMajor.major_id = suffixedId;
        existingIds.add(suffixedId);
    }

    const majorId = generateMajorId(normalizedCode, '', existingIds);
    return { majorId, dbRenames };
}

async function applyMajorIdRenames(tx, dbRenames) {
    const applied = new Map();

    for (const rename of dbRenames) {
        if (applied.has(rename.from)) {
            continue;
        }

        await renameMajorId(tx, rename.from, rename.to);
        applied.set(rename.from, rename.to);
    }
}

module.exports = {
    applyMajorIdRenames,
    resolveMajorIdForInsert,
    listSameCodeMajorIds,
};
