import path from 'path';
import { seedCourseFromJson } from './seed-course-helper';
import { logger } from '../core/logger/logger';

export async function seedHiraCourse() {
  const jsonPath = path.join(__dirname, 'data/hira_safety_data.json');
  return seedCourseFromJson(jsonPath);
}

if (require.main === module) {
  seedHiraCourse()
    .then((res) => {
        logger.info({ res }, 'Finished HIRA safety course seed.');
        process.exit(0);
    })
    .catch((err) => {
        logger.error({ err }, 'HIRA seed failed.');
        process.exit(1);
    });
}
