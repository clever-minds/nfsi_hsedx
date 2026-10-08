import { query, queryOne } from '../../core/db/pool';

/** Baris instructor untuk catalog publik (list & detail). */
export interface PublicInstructorRow {
  id: string; // instructor_profiles.id
  user_id: string;
  nama_lengkap: string;
  foto_profil: string | null;
  bio: string | null;
  keahlian: unknown; // jsonb array of string
  sosial_media: unknown; // jsonb { facebook?, instagram?, x?, youtube?, linkedin?, website? }
  rating_avg: string;
  rating_count: number;
  total_siswa: number;
  jumlah_kursus: number;
}

const BASE_SELECT = `
  SELECT ip.id, ip.user_id, u.nama_lengkap, u.foto_profil, ip.bio, ip.keahlian, ip.sosial_media,
         ip.rating_avg, ip.rating_count, ip.total_siswa,
         (SELECT COUNT(*)::int FROM courses c
           WHERE c.instructor_id = ip.id AND c.deleted_at IS NULL
             AND c.publication_status IN ('terbit','diperbarui')) AS jumlah_kursus
    FROM instructor_profiles ip
    JOIN users u ON u.id = ip.user_id AND u.deleted_at IS NULL
   WHERE ip.deleted_at IS NULL`;

/** Instructor dengan minimal satu course terbit, diurutkan berdasarkan jumlah student. */
export async function publicList(limit = 24): Promise<PublicInstructorRow[]> {
  return query<PublicInstructorRow>(
    `SELECT * FROM (${BASE_SELECT}) t
      WHERE t.jumlah_kursus > 0
      ORDER BY t.total_siswa DESC, t.rating_avg DESC
      LIMIT $1`,
    [limit],
  );
}

export async function publicDetail(id: string): Promise<PublicInstructorRow | null> {
  return queryOne<PublicInstructorRow>(`SELECT * FROM (${BASE_SELECT}) t WHERE t.id = $1`, [id]);
}

/** Course terbit milik seorang instructor (untuk halaman detail instructor). */
export interface InstructorCourseRow {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  level: string;
  price: string;
  rating_avg: string;
  rating_count: number;
  student_count: number;
  durasi_total_menit: number;
  category_nama: string;
  meta: unknown;
}

export async function publicCourses(instructorProfileId: string): Promise<InstructorCourseRow[]> {
  return query<InstructorCourseRow>(
    `SELECT c.id, c.title, c.slug, c.summary, c.level, c.price, c.rating_avg, c.rating_count,
            c.student_count, c.durasi_total_menit, cat.name AS category_nama, c.meta
       FROM courses c
       JOIN categories cat ON cat.id = c.category_id
      WHERE c.instructor_id = $1 AND c.deleted_at IS NULL
        AND c.publication_status IN ('terbit','diperbarui')
      ORDER BY c.student_count DESC`,
    [instructorProfileId],
  );
}
