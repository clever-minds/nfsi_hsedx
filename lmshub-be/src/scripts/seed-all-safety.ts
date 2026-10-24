import { seedChemicalSafetyCourse } from './seed-chemical-safety';
import { seedHiraCourse } from './seed-hira';
import { seedElectricalSafetyCourse } from './seed-electrical';
import { seedLotoCourse } from './seed-loto';
import { logger } from '../core/logger/logger';

export async function seedAllSafetyCourses() {
  logger.info('Starting batch seeding of all 4 HSEdx Safety Courses...');
  
  logger.info('1/4 Seeding Chemical Safety Course...');
  await seedChemicalSafetyCourse();

  logger.info('2/4 Seeding HIRA Safety Course...');
  await seedHiraCourse();

  logger.info('3/4 Seeding Electrical Safety Course...');
  await seedElectricalSafetyCourse();

  logger.info('4/4 Seeding LOTO Safety Course...');
  await seedLotoCourse();

  logger.info('All 4 HSEdx Safety Courses seeded successfully!');
}

if (require.main === module) {
  seedAllSafetyCourses()
    .then(() => {
      logger.info('Batch safety seeding complete.');
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ err }, 'Batch safety seeding failed.');
      process.exit(1);
    });
}
