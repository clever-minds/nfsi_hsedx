const fs = require('fs');
const path = require('path');

const FE_DIR = path.join(__dirname, 'lmshub-fe', 'src');

function fixFiles(dir) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        if (fs.statSync(dirPath).isDirectory()) {
            fixFiles(dirPath);
        } else {
            if (f.endsWith('.vue') || f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.json')) {
                let content = fs.readFileSync(dirPath, 'utf-8');
                let changed = false;
                
                // Fix pointsts
                if (content.includes('pointsts')) {
                    content = content.replace(/pointsts/g, 'points');
                    changed = true;
                }
                if (content.includes('Pointsts')) {
                    content = content.replace(/Pointsts/g, 'Points');
                    changed = true;
                }

                // If QuestionBankView.vue, modify TIPE array and the label
                if (f === 'QuestionBankView.vue') {
                    content = content.replace(
                        /const TIPE = \['single_choice', 'multiple_choice', 'true_false', 'short_answer', 'essay', 'file_upload', 'matching'\];/g,
                        "const TIPE = ['single_choice', 'multiple_choice', 'true_false'];"
                    );
                    content = content.replace(
                        /\{\{ t\('assessments\.bank\.type'\) \}\}/g,
                        "Question Type"
                    );
                    changed = true;
                }
                
                // If QuizBuilderView.vue, check if bank.type is used as a scalar
                if (f === 'QuizBuilderView.vue') {
                    // Nothing to do if not there
                }

                if (changed) {
                    fs.writeFileSync(dirPath, content, 'utf-8');
                    console.log(`Fixed: ${dirPath}`);
                }
            }
        }
    });
}

fixFiles(FE_DIR);
console.log('Done fixing pointsts and QuestionBankView.');
