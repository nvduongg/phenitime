const fs = require('fs');
const path = require('path');

const INPUT_PATH = path.resolve(__dirname, '../data/courses-import.tsv');
const OUTPUT_PATH = path.resolve(__dirname, '../data/course-unit-overrides.json');

function buildOverridesFromTsv(content) {
    const map = {};

    content.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('Mã học phần')) return;

        const parts = trimmed.split('\t');
        if (parts.length < 9) return;

        const courseId = parts[0].trim().toUpperCase();
        const unitId = parts[8].trim().toUpperCase();
        if (!/^[A-Z][A-Z0-9]+$/.test(courseId)) return;
        if (!/^[A-Z]{2,5}$/.test(unitId)) return;

        map[courseId] = unitId;
    });

    return map;
}

function main() {
    if (!fs.existsSync(INPUT_PATH)) {
        console.error(`Missing ${INPUT_PATH}`);
        process.exit(1);
    }

    const content = fs.readFileSync(INPUT_PATH, 'utf8');
    const map = buildOverridesFromTsv(content);
    fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(map, null, 2)}\n`);
    console.log(`Wrote ${Object.keys(map).length} mappings to ${OUTPUT_PATH}`);
}

main();
