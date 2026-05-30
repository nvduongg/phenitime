const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const { parseCourseIdList } = require('../src/utils/parseCourseIdList');

const prisma = new PrismaClient();

const DATA_FILE = process.argv[2] || path.join(__dirname, 'lecturer-import.tsv');

async function main() {
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const lines = raw.trim().split('\n').slice(1); // skip header

  const unitIds = new Set();
  const courseIds = new Set();
  const rows = [];

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const [lecturerId, , unitId, , , specialties] = parts;
    unitIds.add(unitId.trim());
    rows.push({ lecturerId, unitId: unitId.trim(), specialties: specialties?.trim() || '' });
    if (specialties) {
      parseCourseIdList(specialties).forEach((c) => courseIds.add(c));
    }
  }

  const dbUnits = await prisma.organizationUnit.findMany({ select: { unit_id: true } });
  const dbCourses = await prisma.course.findMany({ select: { course_id: true } });
  const unitSet = new Set(dbUnits.map((u) => u.unit_id));
  const courseSet = new Set(dbCourses.map((c) => c.course_id));

  const missingUnits = [...unitIds].filter((u) => !unitSet.has(u)).sort();
  const missingCourses = [...courseIds].filter((c) => !courseSet.has(c)).sort();

  console.log('Rows parsed:', rows.length);
  console.log('Unique units in file:', unitIds.size);
  console.log('Unique courses in file:', courseIds.size);
  console.log('\n=== MISSING UNITS (' + missingUnits.length + ') ===');
  missingUnits.forEach((u) => console.log(' ', u));

  console.log('\n=== MISSING COURSES (' + missingCourses.length + ') ===');
  missingCourses.forEach((c) => {
    const usedBy = rows.filter((r) => parseCourseIdList(r.specialties).includes(c)).map((r) => r.lecturerId);
    console.log(' ', c, '->', usedBy.slice(0, 3).join(', '), usedBy.length > 3 ? `(+${usedBy.length - 3})` : '');
  });

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
