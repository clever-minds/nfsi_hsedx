import path from 'path';
import { seedCourseFromJson } from './seed-course-helper';
import { logger } from '../core/logger/logger';

export async function seedLotoCourse() {
  const jsonPath = path.join(__dirname, 'data/loto_safety_data.json');
  return seedCourseFromJson(jsonPath);
}

if (require.main === module) {
  seedLotoCourse()
    .then((res) => {
      logger.info({ res }, 'Finished LOTO safety course seed.');
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ err }, 'LOTO seed failed.');
      process.exit(1);
    });
}
