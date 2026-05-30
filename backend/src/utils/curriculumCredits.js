async function recalculateCurriculumCredits(prisma, curriculumId) {
    const roadmaps = await prisma.roadmap.findMany({
        where: { curriculum_id: curriculumId },
        include: { course: { select: { credits: true } } },
    });

    const totalCredits = roadmaps.reduce(
        (sum, item) => sum + (item.course?.credits || 0),
        0,
    );

    const normalizedTotal = Math.round(totalCredits * 100) / 100;

    await prisma.curriculum.update({
        where: { curriculum_id: curriculumId },
        data: { total_credits: normalizedTotal },
    });

    return normalizedTotal;
}

module.exports = { recalculateCurriculumCredits };
