import { z } from 'zod';

export const questionTipeEnum = z.enum([
  'pilihan_tunggal',
  'pilihan_ganda',
  'benar_salah',
  'isian_singkat',
  'esai',
  'upload_file',
  'pencocokan',
]);

export const tipePengumpulanEnum = z.enum(['file', 'teks', 'url', 'campuran']);

export const createQuestionBankSchema = z
  .object({
    nama: z.string().min(2).max(150),
    course_id: z.string().uuid().nullable().optional(),
    category_id: z.string().uuid().nullable().optional(),
    deskripsi: z.string().max(2000).nullable().optional(),
  })
  .refine((d) => d.course_id || d.category_id, { message: 'Either course_id or category_id is required', path: ['course_id'] });

export const updateQuestionBankSchema = z.object({
  nama: z.string().min(2).max(150).optional(),
  deskripsi: z.string().max(2000).nullable().optional(),
});

const optionSchema = z.object({
  teks_opsi: z.string().min(1).max(1000),
  is_benar: z.boolean().default(false),
  pasangan_key: z.string().max(50).nullable().optional(),
  urutan: z.number().int().min(0).default(0),
});

export const createQuestionSchema = z.object({
  tipe: questionTipeEnum,
  teks_soal: z.string().min(1),
  poin: z.number().min(0).default(1),
  penjelasan_jawaban: z.string().nullable().optional(),
  meta: z.record(z.unknown()).nullable().optional(),
  options: z.array(optionSchema).default([]),
});

export const updateQuestionSchema = z.object({
  teks_soal: z.string().min(1).optional(),
  poin: z.number().min(0).optional(),
  penjelasan_jawaban: z.string().nullable().optional(),
  meta: z.record(z.unknown()).nullable().optional(),
  options: z.array(optionSchema).optional(),
});

export const createQuizSchema = z.object({
  course_id: z.string().uuid(),
  section_id: z.string().uuid().nullable().optional(),
  lesson_id: z.string().uuid().nullable().optional(),
  judul: z.string().min(2).max(200),
  deskripsi: z.string().nullable().optional(),
  batas_waktu_menit: z.number().int().positive().nullable().optional(),
  acak_soal: z.boolean().default(false),
  acak_opsi: z.boolean().default(false),
  attempt_maksimal: z.number().int().min(1).default(1),
  passing_score: z.number().min(0).max(100).nullable().optional(),
  tampilkan_jawaban_setelah_selesai: z.boolean().default(false),
  is_aktif: z.boolean().default(true),
});

export const updateQuizSchema = createQuizSchema.partial().omit({ course_id: true });

export const setQuizQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        question_id: z.string().uuid(),
        urutan: z.number().int().min(0).default(0),
        poin_override: z.number().min(0).nullable().optional(),
      }),
    )
    .min(1),
});

export const createAssignmentSchema = z.object({
  course_id: z.string().uuid(),
  section_id: z.string().uuid().nullable().optional(),
  lesson_id: z.string().uuid().nullable().optional(),
  judul: z.string().min(2).max(200),
  instruksi: z.string().min(1),
  tenggat_at: z.string().datetime().nullable().optional(),
  tipe_pengumpulan: tipePengumpulanEnum.default('file'),
  maksimal_ukuran_mb: z.number().int().positive().nullable().optional(),
  poin_maksimal: z.number().min(0).default(100),
  is_aktif: z.boolean().default(true),
});

export const updateAssignmentSchema = createAssignmentSchema.partial().omit({ course_id: true });

export const upsertRubricSchema = z.object({
  kriteria: z
    .array(
      z.object({
        nama: z.string().min(1).max(150),
        bobot: z.number().min(0).max(100),
        deskripsi_level: z.string().optional(),
      }),
    )
    .min(1),
});

export const saveAnswerSchema = z.object({
  question_id: z.string().uuid(),
  jawaban: z.unknown(),
});

export const submitAssignmentSchema = z.object({
  isi_teks: z.string().nullable().optional(),
  file_media_id: z.string().uuid().nullable().optional(),
  url: z.string().url().nullable().optional(),
});

export type CreateQuestionBankInput = z.infer<typeof createQuestionBankSchema>;
export type UpdateQuestionBankInput = z.infer<typeof updateQuestionBankSchema>;
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
export type CreateQuizInput = z.infer<typeof createQuizSchema>;
export type UpdateQuizInput = z.infer<typeof updateQuizSchema>;
export type SetQuizQuestionsInput = z.infer<typeof setQuizQuestionsSchema>;
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type UpsertRubricInput = z.infer<typeof upsertRubricSchema>;
export type SaveAnswerInput = z.infer<typeof saveAnswerSchema>;
export type SubmitAssignmentInput = z.infer<typeof submitAssignmentSchema>;
