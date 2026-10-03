import { pool } from '../core/db/pool';
import { logger } from '../core/logger/logger';
import { installDemoMedia, courseThumbnailUrl } from './demo-media';

async function one<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  const r = await pool.query<T>(sql, params);
  return r.rows[0] ?? null;
}

const FIRE_SAFETY_COURSES = [
  { title: 'Fire Safety Basics', slug: 'fire-safety-basics', categorySlug: 'fire', categoryName: 'Fire', icon: '🔥', price: 0, learn: ['Understanding fire triangle', 'Types of fires', 'Evacuation procedures'] },
  { title: 'Advanced Fire Fighting', slug: 'advanced-fire-fighting', categorySlug: 'fire', categoryName: 'Fire', icon: '🔥', price: 49, learn: ['Using fire extinguishers', 'Fire hoses and hydrants', 'Breathing apparatus'] },
  { title: 'Workplace Fire Hazards', slug: 'workplace-fire-hazards', categorySlug: 'occupational-safety', categoryName: 'Occupational Safety', icon: '👷', price: 29, learn: ['Identifying hazards', 'Electrical safety', 'Chemical storage'] },
  { title: 'Fire Warden Training', slug: 'fire-warden-training', categorySlug: 'fire', categoryName: 'Fire', icon: '🔥', price: 99, learn: ['Role of a fire warden', 'Emergency response plan', 'Conducting fire drills'] },
  { title: 'Industrial Fire Protection', slug: 'industrial-fire-protection', categorySlug: 'occupational-safety', categoryName: 'Occupational Safety', icon: '👷', price: 149, learn: ['Industrial hazards', 'Suppression systems', 'Explosion prevention'] },
  { title: 'Home Fire Safety', slug: 'home-fire-safety', categorySlug: 'health-environment', categoryName: 'Health & Environment', icon: '🌍', price: 0, learn: ['Kitchen fire safety', 'Smoke alarms', 'Family escape plans'] },
  { title: 'Construction Site Fire Safety', slug: 'construction-fire-safety', categorySlug: 'occupational-safety', categoryName: 'Occupational Safety', icon: '👷', price: 79, learn: ['Hot work permits', 'Flammable materials', 'Temporary fire systems'] },
  { title: 'Fire Risk Assessment', slug: 'fire-risk-assessment', categorySlug: 'occupational-safety', categoryName: 'Occupational Safety', icon: '👷', price: 89, learn: ['Legal requirements', 'Conducting assessments', 'Implementing controls'] },
  { title: 'Healthcare Fire Safety', slug: 'healthcare-fire-safety', categorySlug: 'health-environment', categoryName: 'Health & Environment', icon: '🌍', price: 119, learn: ['Evacuating patients', 'Oxygen fire risks', 'Hospital fire systems'] },
  { title: 'Wildfire Preparedness', slug: 'wildfire-preparedness', categorySlug: 'health-environment', categoryName: 'Health & Environment', icon: '🌍', price: 0, learn: ['Defensible space', 'Evacuation kits', 'Home hardening'] },
  { title: 'Marine Fire Fighting', slug: 'marine-fire-fighting', categorySlug: 'fire', categoryName: 'Fire', icon: '🔥', price: 199, learn: ['Vessel fire dynamics', 'Shipboard suppression', 'Abandon ship procedures'] },
  { title: 'Aviation Fire Rescue', slug: 'aviation-fire-rescue', categorySlug: 'fire', categoryName: 'Fire', icon: '🔥', price: 249, learn: ['Aircraft hazards', 'ARFF operations', 'Passenger rescue'] },
  { title: 'Fire Investigation Basics', slug: 'fire-investigation-basics', categorySlug: 'fire', categoryName: 'Fire', icon: '🔥', price: 159, learn: ['Origin and cause', 'Evidence collection', 'Arson indicators'] },
  { title: 'High-Rise Fire Safety', slug: 'high-rise-fire-safety', categorySlug: 'occupational-safety', categoryName: 'Occupational Safety', icon: '👷', price: 129, learn: ['Stairwell evacuation', 'Standpipe systems', 'Elevator procedures'] },
  { title: 'Fire Prevention Systems', slug: 'fire-prevention-systems', categorySlug: 'occupational-safety', categoryName: 'Occupational Safety', icon: '👷', price: 69, learn: ['Sprinkler basics', 'Fire alarms', 'System maintenance'] },
];

const YOUTUBE_URLS = [
  'https://www.youtube.com/watch?v=U4iBCMWC4xM', 
  'https://www.youtube.com/watch?v=-aAee7qEOn4',
  'https://www.youtube.com/watch?v=VXyW2TyDeZ8',
  'https://www.youtube.com/watch?v=UlKS_A7Xg1E',
  'https://www.youtube.com/watch?v=KRPRggeiVQ4',
];

async function main() {
  logger.info('Starting Fire Safety courses seeding...');

  await installDemoMedia({
    courses: FIRE_SAFETY_COURSES.map(c => ({
      slug: c.slug,
      title: c.title,
      category: c.categorySlug,
      categoryLabel: c.categoryName,
      level: 'Beginner'
    })),
    people: []
  });
  
  // 1. Get an instructor profile
  let instructorProfile = await one<{ id: string }>(`SELECT id FROM instructor_profiles LIMIT 1`);
  if (!instructorProfile) {
    // We need an instructor profile. So create a user and an instructor profile.
    const role = await one<{ id: string }>(`SELECT id FROM roles WHERE kode = 'instruktur'`);
    if (!role) throw new Error('Instructor role not found');
    
    let instructor = await one<{ id: string }>(`SELECT id FROM users WHERE role_id = $1 LIMIT 1`, [role.id]);
    if (!instructor) {
        // fallback to super admin user
        const superRole = await one<{ id: string }>(`SELECT id FROM roles WHERE kode = 'super_admin'`);
        instructor = await one<{ id: string }>(`SELECT id FROM users WHERE role_id = $1 LIMIT 1`, [superRole!.id]);
    }
    
    if (!instructor) throw new Error('No user found to act as instructor');

    instructorProfile = await one<{ id: string }>(
      `INSERT INTO instructor_profiles (user_id, bio, status_verifikasi) VALUES ($1, 'Fire Safety Expert', 'terverifikasi') RETURNING id`,
      [instructor.id]
    );
  }
  if (!instructorProfile) throw new Error('Failed to setup instructor profile');

  // 3. Insert courses
  let courseIndex = 0;
  for (const c of FIRE_SAFETY_COURSES) {
    let cat = await one<{ id: string }>(`SELECT id FROM categories WHERE slug = $1`, [c.categorySlug]);
    if (!cat) {
      cat = await one<{ id: string }>(
        `INSERT INTO categories (nama, slug, ikon) VALUES ($1,$2,$3) RETURNING id`,
        [c.categoryName, c.categorySlug, c.icon]
      );
    }
    if (!cat) continue;

    const row = await one<{ id: string }>(
      `INSERT INTO courses (judul, slug, ringkasan, deskripsi, category_id, instructor_id, level, harga, harga_coret,
                            status_publikasi, bahasa, rating_avg, rating_count, jumlah_siswa,
                            durasi_total_menit, meta, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'terbit','en', 4.5, 10, 50, $10, $11, now())
       ON CONFLICT (slug) WHERE deleted_at IS NULL DO UPDATE SET
         judul=EXCLUDED.judul, harga=EXCLUDED.harga, category_id=EXCLUDED.category_id, meta=EXCLUDED.meta
       RETURNING id`,
      [
        c.title,
        c.slug,
        `Learn about ${c.title} with this comprehensive course.`,
        `This course covers everything you need to know about ${c.title}. Enroll now to improve your safety skills.`,
        cat.id,
        instructorProfile.id,
        'pemula',
        c.price,
        c.price === 0 ? 0 : c.price + 20,
        c.learn.length * 15,
        JSON.stringify({
          thumbnail_url: courseThumbnailUrl(c.slug),
          yang_dipelajari: c.learn,
          persyaratan: ['No prior experience needed', 'Internet connection'],
          cocok_untuk: ['Safety officers', 'General public', 'Professionals'],
        }),
      ],
    );

    if (!row) continue;

    // Delete existing sections to recreate
    await pool.query(`DELETE FROM sections WHERE course_id = $1`, [row.id]);

    // Create a section
    const sec = await one<{ id: string }>(
      `INSERT INTO sections (course_id, judul, urutan) VALUES ($1,$2,$3) RETURNING id`,
      [row.id, 'Core Training Modules', 1]
    );

    if (!sec) continue;

    // Create lessons
    let lOrder = 1;
    for (const lessonTitle of c.learn) {
      const lesson = await one<{ id: string }>(
        `INSERT INTO lessons (section_id, judul, tipe, urutan, durasi_menit, gratis_preview, wajib_selesai)
         VALUES ($1,$2,'video',$3,$4,$5,true) RETURNING id`,
        [sec.id, lessonTitle, lOrder, 15, c.price === 0 || lOrder === 1]
      );

      if (lesson) {
        await pool.query(
          `INSERT INTO lesson_contents (lesson_id, tipe, urutan, url, durasi_detik)
           VALUES ($1,'video',0,$2,$3)`,
          [lesson.id, YOUTUBE_URLS[lOrder % YOUTUBE_URLS.length], 900]
        );
      }
      lOrder++;
    }
    courseIndex++;
  }

  logger.info('Successfully seeded 15 Fire Safety courses with Curriculum, YouTube videos, and Thumbnails!');
  await pool.end();
}

main().catch((err) => {
  logger.error({ err }, 'Fire safety seed failed');
  process.exit(1);
});
