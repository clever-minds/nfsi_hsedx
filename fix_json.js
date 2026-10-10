const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, 'lmshub-fe', 'src', 'i18n', 'messages');

const keyMap = {
    'pilihan_tunggal': 'single_choice',
    'pilihan_ganda': 'multiple_choice',
    'benar_salah': 'true_false',
    'isian_singkat': 'short_answer',
    'esai': 'essay',
    'upload_file': 'file_upload'
};

function fixJsonFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // Fix pointsts -> points
    content = content.replace(/pointsts/g, 'points');
    content = content.replace(/Pointsts/g, 'Points');
    
    // If it's assessments.json, fix the type keys
    if (path.basename(filePath) === 'assessments.json') {
        let json = JSON.parse(content);
        if (json.bank && json.bank.type) {
            let newType = {};
            for (let k in json.bank.type) {
                if (keyMap[k]) {
                    newType[keyMap[k]] = json.bank.type[k];
                } else {
                    newType[k] = json.bank.type[k];
                }
            }
            json.bank.type = newType;
            content = JSON.stringify(json, null, 2);
        }
    }
    
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Fixed: ${filePath}`);
}

function walkDir(dir) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        if (fs.statSync(dirPath).isDirectory()) {
            walkDir(dirPath);
        } else if (f.endsWith('.json')) {
            fixJsonFile(dirPath);
        }
    });
}

walkDir(LOCALES_DIR);
console.log('Done fixing JSON translations.');
