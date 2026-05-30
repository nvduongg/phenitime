function parseCourseIdList(raw) {
    if (raw === undefined || raw === null) return [];

    return [
        ...new Set(
            String(raw)
                .split(/[,;|]/)
                .map((item) => item.trim())
                .filter(Boolean),
        ),
    ];
}

module.exports = {
    parseCourseIdList,
};
