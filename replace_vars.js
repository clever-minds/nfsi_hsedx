const fs = require('fs');
const path = require('path');

const BE_DIR = path.join(__dirname, 'lmshub-be');
const FE_DIR = path.join(__dirname, 'lmshub-fe');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        if (isDirectory) {
            if (!dirPath.includes('node_modules') && !dirPath.includes('.git') && !dirPath.includes('dist')) {
                walkDir(dirPath, callback);
            }
        } else {
            if (f.endsWith('.ts') || f.endsWith('.vue') || f.endsWith('.js') || f.endsWith('.json')) {
                callback(dirPath);
            }
        }
    });
}

function processFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (content.includes('ujian_akhir') || content.includes('ujianAkhir')) {
        let newContent = content.replace(/ujian_akhir/g, 'final_exam');
        newContent = newContent.replace(/ujianAkhir/g, 'finalExam');
        fs.writeFileSync(filePath, newContent, 'utf-8');
        console.log(`Updated: ${filePath}`);
    }
}

walkDir(BE_DIR, processFile);
walkDir(FE_DIR, processFile);
console.log('Done replacing ujian_akhir with final_exam.');
