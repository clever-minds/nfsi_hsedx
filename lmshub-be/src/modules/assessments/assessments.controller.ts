import { Request, Response } from 'express';
import { ok, created, noContent } from '../../core/http/envelope';
import { validated } from '../../core/validation/validate';
import { AppError } from '../../core/http/AppError';
import * as service from './assessments.service';
import {
  CreateAssignmentInput,
  CreateQuestionBankInput,
  CreateQuestionInput,
  CreateQuizInput,
  SaveAnswerInput,
  SetQuizQuestionsInput,
  SubmitAssignmentInput,
  UpdateAssignmentInput,
  UpdateQuestionBankInput,
  UpdateQuestionInput,
  UpdateQuizInput,
  UpsertRubricInput,
} from './assessments.validation';

const auth = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
};

// ── Question Banks ──────────────────────────────────────

export async function listQuestionBanks(req: Request, res: Response) {
  const filters = {
    course_id: req.query['filter[course_id]'] as string | undefined,
    category_id: req.query['filter[category_id]'] as string | undefined,
  };
  return ok(res, await service.listQuestionBanks(auth(req), filters));
}

export async function questionBankDetail(req: Request, res: Response) {
  return ok(res, await service.questionBankDetail(auth(req), req.params.id));
}

export async function createQuestionBank(req: Request, res: Response) {
  return created(res, await service.createQuestionBank(auth(req), validated<CreateQuestionBankInput>(req)));
}

export async function updateQuestionBank(req: Request, res: Response) {
  return ok(res, await service.updateQuestionBank(auth(req), req.params.id, validated<UpdateQuestionBankInput>(req)));
}

export async function removeQuestionBank(req: Request, res: Response) {
  await service.removeQuestionBank(auth(req), req.params.id);
  return noContent(res);
}

// ── Questions ────────────────────────────────────────────

export async function listQuestions(req: Request, res: Response) {
  return ok(res, await service.listQuestions(auth(req), req.params.id));
}

export async function createQuestion(req: Request, res: Response) {
  return created(res, await service.createQuestion(auth(req), req.params.id, validated<CreateQuestionInput>(req)));
}

export async function updateQuestion(req: Request, res: Response) {
  return ok(res, await service.updateQuestion(auth(req), req.params.id, validated<UpdateQuestionInput>(req)));
}

export async function removeQuestion(req: Request, res: Response) {
  await service.removeQuestion(auth(req), req.params.id);
  return noContent(res);
}

// ── Quizzes ──────────────────────────────────────────────

export async function listQuizzes(req: Request, res: Response) {
  const filters = { course_id: req.query['filter[course_id]'] as string | undefined };
  return ok(res, await service.listQuizzes(auth(req), filters));
}

export async function quizDetail(req: Request, res: Response) {
  return ok(res, await service.quizDetail(auth(req), req.params.id));
}

export async function createQuiz(req: Request, res: Response) {
  return created(res, await service.createQuiz(auth(req), validated<CreateQuizInput>(req)));
}

export async function updateQuiz(req: Request, res: Response) {
  return ok(res, await service.updateQuiz(auth(req), req.params.id, validated<UpdateQuizInput>(req)));
}

export async function removeQuiz(req: Request, res: Response) {
  await service.removeQuiz(auth(req), req.params.id);
  return noContent(res);
}

export async function setQuizQuestions(req: Request, res: Response) {
  return ok(res, await service.setQuizQuestions(auth(req), req.params.id, validated<SetQuizQuestionsInput>(req)));
}

// ── Assignments & Rubrics ───────────────────────────────

export async function listAssignments(req: Request, res: Response) {
  const filters = { course_id: req.query['filter[course_id]'] as string | undefined };
  return ok(res, await service.listAssignments(auth(req), filters));
}

export async function assignmentDetail(req: Request, res: Response) {
  return ok(res, await service.assignmentDetail(auth(req), req.params.id));
}

export async function createAssignment(req: Request, res: Response) {
  return created(res, await service.createAssignment(auth(req), validated<CreateAssignmentInput>(req)));
}

export async function updateAssignment(req: Request, res: Response) {
  return ok(res, await service.updateAssignment(auth(req), req.params.id, validated<UpdateAssignmentInput>(req)));
}

export async function removeAssignment(req: Request, res: Response) {
  await service.removeAssignment(auth(req), req.params.id);
  return noContent(res);
}

export async function upsertRubric(req: Request, res: Response) {
  return ok(res, await service.upsertRubric(auth(req), req.params.id, validated<UpsertRubricInput>(req)));
}

// ── Attempts (siswa) ──────────────────────────────────────

export async function startAttempt(req: Request, res: Response) {
  return created(res, await service.startAttempt(auth(req), req.params.id));
}

export async function attemptDetail(req: Request, res: Response) {
  return ok(res, await service.attemptDetail(auth(req), req.params.id));
}

export async function saveAnswer(req: Request, res: Response) {
  return ok(res, await service.saveAnswer(auth(req), req.params.id, validated<SaveAnswerInput>(req)));
}

export async function submitAttempt(req: Request, res: Response) {
  return ok(res, await service.submitAttempt(auth(req), req.params.id));
}

// ── Assignment Submissions ───────────────────────────────

export async function submitAssignment(req: Request, res: Response) {
  return created(res, await service.submitAssignment(auth(req), req.params.id, validated<SubmitAssignmentInput>(req)));
}

export async function listSubmissionsForAssignment(req: Request, res: Response) {
  return ok(res, await service.listSubmissionsForAssignment(auth(req), req.params.id));
}
