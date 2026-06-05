const { PrismaClient } = require('@prisma/client');

async function loadUnitTree(prisma) {
    return prisma.organizationUnit.findMany({
        select: { unit_id: true, parent_id: true },
    });
}

function collectDescendantIds(units, rootId) {
    const childrenByParent = new Map();
    for (const unit of units) {
        const parentKey = unit.parent_id || '__root__';
        if (!childrenByParent.has(parentKey)) {
            childrenByParent.set(parentKey, []);
        }
        childrenByParent.get(parentKey).push(unit.unit_id);
    }

    const result = new Set([rootId]);
    const queue = [rootId];
    while (queue.length) {
        const current = queue.shift();
        const children = childrenByParent.get(current) || [];
        for (const childId of children) {
            if (!result.has(childId)) {
                result.add(childId);
                queue.push(childId);
            }
        }
    }
    return [...result];
}

async function resolveScopeUnitIds(prisma, scopeUnitId) {
    if (!scopeUnitId) {
        return null;
    }
    const units = await loadUnitTree(prisma);
    const exists = units.some((u) => u.unit_id === scopeUnitId);
    if (!exists) {
        return [scopeUnitId];
    }
    return collectDescendantIds(units, scopeUnitId);
}

function unitWhereInScope(scopeUnitIds, field = 'unit_id') {
    if (!scopeUnitIds) {
        return {};
    }
    return { [field]: { in: scopeUnitIds } };
}

module.exports = {
    resolveScopeUnitIds,
    unitWhereInScope,
    collectDescendantIds,
};
