function slugifyMajorName(majorName) {
    const name = String(majorName || '').trim();
    if (!name) return 'NGANH';

    const parenMatch = name.match(/\(([^)]+)\)/);
    if (parenMatch) {
        const hint = parenMatch[1]
            .split(/\s+/)
            .filter(Boolean)
            .map((word) => word[0])
            .join('')
            .toUpperCase();
        if (hint.length >= 2) {
            return hint.slice(0, 8);
        }
    }

    const normalized = name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .trim();

    const words = normalized.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
        return words
            .map((word) => word[0])
            .join('')
            .toUpperCase()
            .slice(0, 8);
    }

    return (words[0] || 'NGANH').toUpperCase().slice(0, 8);
}

function generateMajorId(majorCode, majorName, existingIds) {
    const code = String(majorCode || '').trim();
    const slug = slugifyMajorName(majorName);
    let candidate = `${code}-${slug}`;
    let counter = 2;

    while (existingIds.has(candidate)) {
        candidate = `${code}-${slug}${counter}`;
        counter += 1;
    }

    return candidate;
}

module.exports = {
    slugifyMajorName,
    generateMajorId,
};
