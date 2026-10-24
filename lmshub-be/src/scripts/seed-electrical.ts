import path from 'path';
import { seedCourseFromJson } from './seed-course-helper';
import { logger } from '../core/logger/logger';

export async function seedElectricalSafetyCourse() {
  const jsonPath = path.join(__dirname, 'data/electrical_safety_data.json');
  return seedCourseFromJson(jsonPath);
}

if (require.main === module) {
  seedElectricalSafetyCourse()
    .then((res) => {
      logger.info({ res }, 'Finished Electrical Safety course seed.');
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ err }, 'Electrical Safety seed failed.');
      process.exit(1);
    });
}
