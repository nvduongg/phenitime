const fs = require('fs');

const filePath = 'c:/Users/duong/DATN/phenitime/report_thesis_graduation/main_v2.tex';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

const targets = [
    '716', '395', '343', '251', '458', '214', '182', '193', '283',
    '53,63', '56,27', '35,86', '91,80', '332', '150', '161',
    '271,92', '147,96', '104,96', '21,32'
];

lines.forEach((line, idx) => {
    targets.forEach((t) => {
        if (line.includes(t)) {
            console.log(`Line ${idx + 1} [${t}]: ${line.trim()}`);
        }
    });
});
