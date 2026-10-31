import crypto from 'crypto';
import { AppError } from '../../core/http/AppError';
import { AuthContext } from '../../core/rbac/types';
import { env } from '../../core/config/env';
import { sendMail } from '../../core/mail/mailer';
import { generateCertificatePdf } from '../certificates/certificate-pdf';
import * as repo from './blogs.repository';
import { CreateBlogInput, ListBlogQuery, SubmitBlogQuizInput, UpdateBlogInput } from './blogs.validation';

export async function listPublicBlogs(query: ListBlogQuery) {
  return repo.listPublicBlogs({
    page: query.page,
    limit: query.limit,
    search: query.search,
    category: query.category,
  });
}

export async function getPublicBlogDetail(slug: string) {
  const post = await repo.findPublicBlogBySlug(slug);
  if (!post) {
    throw AppError.notFound('Blog post not found', 'blog.not_found');
  }

  // Security: Strip out correct_answer from public quiz response so readers cannot cheat
  let safeQuizData = null;
  if (post.quiz_data && post.quiz_data.enabled && Array.isArray(post.quiz_data.questions)) {
    safeQuizData = {
      enabled: true,
      title: post.quiz_data.title || `${post.title} — Knowledge Check`,
      passing_score: post.quiz_data.passing_score ?? 70,
      questions: post.quiz_data.questions.map((q, idx) => ({
        id: q.id || `q_${idx}`,
        question: q.question,
        options: q.options,
      })),
    };
  }

  return {
    ...post,
    quiz_data: safeQuizData,
  };
}

export async function listCategories() {
  return repo.listCategories();
}

export async function listAdminBlogs(query: ListBlogQuery) {
  return repo.listAdminBlogs({
    page: query.page,
    limit: query.limit,
    search: query.search,
    category: query.category,
    status: query.status,
  });
}

export async function getAdminBlogDetail(id: string) {
  const post = await repo.findBlogById(id);
  if (!post) {
    throw AppError.notFound('Blog post not found', 'blog.not_found');
  }
  return post;
}

export async function createAdminBlog(actor: AuthContext, input: CreateBlogInput) {
  const exists = await repo.slugExists(input.slug);
  if (exists) {
    throw AppError.conflict('A blog post with this slug already exists', 'blog.slug_exists');
  }

  const publishedAt = input.status === 'published' ? (input.published_at || new Date().toISOString()) : null;

  return repo.insertBlog({
    title: input.title,
    slug: input.slug,
    summary: input.summary ?? null,
    content: input.content,
    cover_image_url: input.cover_image_url ?? null,
    author_id: actor.userId,
    author_name: input.author_name || 'NFSI Faculty / Admin',
    category: input.category || 'General',
    tags: input.tags || [],
    status: input.status || 'draft',
    published_at: publishedAt,
    quiz_data: input.quiz_data ?? null,
  });
}

export async function updateAdminBlog(id: string, input: UpdateBlogInput) {
  const post = await repo.findBlogById(id);
  if (!post) {
    throw AppError.notFound('Blog post not found', 'blog.not_found');
  }

  if (input.slug && input.slug !== post.slug) {
    const exists = await repo.slugExists(input.slug, id);
    if (exists) {
      throw AppError.conflict('A blog post with this slug already exists', 'blog.slug_exists');
    }
  }

  const fields: Record<string, unknown> = {};
  if (input.title !== undefined) fields.title = input.title;
  if (input.slug !== undefined) fields.slug = input.slug;
  if (input.summary !== undefined) fields.summary = input.summary;
  if (input.content !== undefined) fields.content = input.content;
  if (input.cover_image_url !== undefined) fields.cover_image_url = input.cover_image_url;
  if (input.author_name !== undefined) fields.author_name = input.author_name;
  if (input.category !== undefined) fields.category = input.category;
  if (input.tags !== undefined) fields.tags = input.tags;
  if (input.status !== undefined) {
    fields.status = input.status;
    if (input.status === 'published' && !post.published_at) {
      fields.published_at = input.published_at || new Date().toISOString();
    }
  }
  if (input.published_at !== undefined) fields.published_at = input.published_at;
  if (input.quiz_data !== undefined) fields.quiz_data = input.quiz_data;

  await repo.updateBlog(id, fields);
  return repo.findBlogById(id);
}

export async function deleteAdminBlog(id: string) {
  const post = await repo.findBlogById(id);
  if (!post) {
    throw AppError.notFound('Blog post not found', 'blog.not_found');
  }
  await repo.softDeleteBlog(id);
}

export async function submitBlogQuiz(slug: string, input: SubmitBlogQuizInput) {
  const post = await repo.findPublicBlogBySlug(slug);
  if (!post) {
    throw AppError.notFound('Blog post not found', 'blog.not_found');
  }

  const quiz = post.quiz_data;
  if (!quiz || !quiz.enabled || !Array.isArray(quiz.questions) || !quiz.questions.length) {
    throw AppError.badRequest('This article does not have an active quiz', 'quiz.not_available');
  }

  const totalQuestions = quiz.questions.length;
  let correctCount = 0;

  const review = quiz.questions.map((q, idx) => {
    const qKey = q.id || `q_${idx + 1}`;
    const userSelected = input.answers[qKey] ?? input.answers[String(idx)];
    const selectedIdx = userSelected !== undefined && userSelected !== null ? Number(userSelected) : null;
    const isCorrect = selectedIdx !== null && selectedIdx === Number(q.correct_answer);
    if (isCorrect) {
      correctCount++;
    }
    return {
      id: qKey,
      question: q.question,
      options: q.options,
      selected_answer: selectedIdx,
      selected_option_text: selectedIdx !== null ? (q.options[selectedIdx] || null) : null,
      correct_answer: Number(q.correct_answer),
      correct_option_text: q.options[Number(q.correct_answer)] || null,
      is_correct: isCorrect,
    };
  });

  const incorrectCount = totalQuestions - correctCount;
  const score = Math.round((correctCount / totalQuestions) * 100);
  const passingScore = quiz.passing_score ?? 70;
  const passed = score >= passingScore;

  if (!passed) {
    return {
      passed: false,
      score,
      passing_score: passingScore,
      total_questions: totalQuestions,
      correct_count: correctCount,
      incorrect_count: incorrectCount,
      review,
      message: `You scored ${score}%. The required passing score is ${passingScore}%. Please review the questions below and try again!`,
    };
  }

  // Generate Unique Verified Certificate
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  const certCode = `CERT-${Math.floor(10 + Math.random() * 90)}-${suffix}`;
  const verifyCode = crypto.randomBytes(5).toString('hex').toUpperCase();
  const baseUrl = (env.PUBLIC_WEB_URL || 'https://hsedx.nfsi.in').replace(/\/$/, '');
  const verifyUrl = `${baseUrl}/certificates/${encodeURIComponent(certCode)}`;
  const now = new Date();
  const dateFormatted = now.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  // Record certificate in database
  const userOrg = input.organization?.trim() || 'Individual';
  await repo.createBlogCertificate({
    blog_id: post.id,
    recipient_name: input.name.trim(),
    recipient_email: input.email.trim().toLowerCase(),
    certificate_number: certCode,
    verification_code: verifyCode,
    qr_code_url: verifyUrl,
    score,
    publish_date: now,
    organization: userOrg,
    mobile_number: input.mobile_number?.trim() || null,
  });

  // Generate PDF attachment buffer
  let pdfBuffer: Buffer | null = null;
  try {
    pdfBuffer = generateCertificatePdf({
      studentName: input.name.trim(),
      courseTitle: post.title,
      certNumber: certCode,
      completionDate: dateFormatted,
      duration: 'Self-Paced Assessment',
      instructor: 'Dr. Chiragkumar Makwana',
      verifyUrl,
      template: 'participation',
      organization: userOrg,
    });
  } catch (err) {
    console.error('Failed to generate certificate PDF attachment:', err);
  }

  // Compose and send email
  const emailHtml = `
  <div style="font-family: Arial, Helvetica, sans-serif; max-width: 620px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
    <div style="background: linear-gradient(135deg, #1e3a8a 0%, #172554 100%); padding: 28px 24px; text-align: center; color: #ffffff;">
      <h1 style="margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 0.5px;">Congratulations, ${input.name.trim()}!</h1>
      <p style="margin: 8px 0 0; font-size: 15px; opacity: 0.95;">Here is your Certificate of Participation</p>
    </div>

    <div style="padding: 28px 24px; color: #334155; line-height: 1.6;">
      <p style="font-size: 15px; margin: 0 0 16px;">
        Thank you for participating in our safety awareness assessment. You achieved a passing score of <strong>${score}%</strong> for:
      </p>
      
      <div style="background-color: #f8fafc; border-left: 4px solid #1e40af; padding: 14px 18px; border-radius: 4px; margin-bottom: 20px;">
        <h3 style="margin: 0; color: #0f172a; font-size: 16px;">${post.title}</h3>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
        <tr>
          <td style="padding: 8px 0; color: #64748b; width: 40%;">Participant Name:</td>
          <td style="padding: 8px 0; font-weight: bold; color: #0f172a;">${input.name.trim()}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b;">Organization / Company:</td>
          <td style="padding: 8px 0; font-weight: bold; color: #0f172a;">${userOrg}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b;">Certificate ID:</td>
          <td style="padding: 8px 0; font-weight: bold; color: #0f172a; font-family: monospace; font-size: 15px;">${certCode}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b;">Issue Date:</td>
          <td style="padding: 8px 0; font-weight: bold; color: #0f172a;">${dateFormatted}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b;">Issued By:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #1e40af;">Himaya Prevention Private Limited</td>
        </tr>
      </table>

      <div style="text-align: center; margin: 28px 0 16px;">
        <a href="${verifyUrl}" style="background-color: #1e40af; color: #ffffff; text-decoration: none; padding: 13px 28px; border-radius: 6px; font-weight: bold; font-size: 15px; display: inline-block;">
          View & Verify Certificate Online
        </a>
      </div>

      <p style="font-size: 13px; color: #64748b; text-align: center; margin: 0 0 20px;">
        Your official Certificate of Participation (PDF) is attached to this email.
      </p>

      <div style="background-color: #f1f5f9; padding: 12px; border-radius: 6px; font-size: 11px; color: #64748b; line-height: 1.5; margin-bottom: 20px;">
        <em>Disclaimer: This activity is for safety awareness only and is not authorization, competency evidence, training certification or a qualification.</em>
      </div>

      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />

      <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
        Himaya Prevention Private Limited &amp; NFSI<br />
        Vadodara, Gujarat, India
      </p>
    </div>
  </div>
  `;

  let emailSent = false;
  try {
    const mailRes = await sendMail({
      to: input.email.trim(),
      subject: `Certificate of Participation: ${post.title} (ID: ${certCode})`,
      html: emailHtml,
      attachments: pdfBuffer
        ? [
            {
              filename: `Certificate-of-Participation-${certCode}.pdf`,
              content: pdfBuffer,
              contentType: 'application/pdf',
            },
          ]
        : undefined,
    });
    emailSent = Boolean(mailRes?.sent);
  } catch (err) {
    console.error('Failed to send certificate email:', err);
    emailSent = false;
  }

  const downloadUrl = `/api/v1/public/certificates/${encodeURIComponent(certCode)}/download`;

  return {
    passed: true,
    score,
    passing_score: passingScore,
    total_questions: totalQuestions,
    correct_count: correctCount,
    incorrect_count: incorrectCount,
    review,
    email_sent: emailSent,
    certificate_number: certCode,
    verify_url: verifyUrl,
    download_url: downloadUrl,
    message: `Congratulations ${input.name.trim()}! You scored ${score}%. Your Certificate of Participation is ready.`,
  };
}
