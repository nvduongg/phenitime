async function renameMajorId(tx, oldMajorId, newMajorId) {
    if (oldMajorId === newMajorId) {
        return;
    }

    const curricula = await tx.curriculum.findMany({
        where: { major_id: oldMajorId },
        select: { curriculum_id: true, cohort_id: true },
    });

    for (const curriculum of curricula) {
        const newCurriculumId = `${newMajorId}-${curriculum.cohort_id}`;
        if (curriculum.curriculum_id === newCurriculumId) {
            continue;
        }

        await tx.curriculum.update({
            where: { curriculum_id: curriculum.curriculum_id },
            data: { curriculum_id: newCurriculumId },
        });
    }

    await tx.major.update({
        where: { major_id: oldMajorId },
        data: { major_id: newMajorId },
    });
}

module.exports = {
    renameMajorId,
};
