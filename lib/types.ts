export type DocumentKind = "questions" | "answers";

export type NormalizedBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PageRegion = {
  id: string;
  pageNumber: number;
  box: NormalizedBox;
  kind: "label" | "answer" | "continuation";
};

export type PreparedPage = {
  id: string;
  pageNumber: number;
  name: string;
  blob: Blob;
  previewUrl: string;
  width: number;
  height: number;
};

export type PreparedDocument = {
  kind: DocumentKind;
  sourceNames: string[];
  pages: PreparedPage[];
};

export type ExtractedQuestion = {
  id: string;
  originalLabel: string;
  normalizedLabel: string;
  parentLabel: string | null;
  subpartLabel: string | null;
  sharedStem: string | null;
  text: string;
  fullText: string;
  maxMarks: number | null;
  orderIndex: number;
  pageNumber: number;
  readingOrder: number;
  sourceRegions: PageRegion[];
  extractionConfidence: number;
  continuesFromPrevious: boolean;
  continuesToNext: boolean;
};

export type AnswerBlock = {
  id: string;
  detectedLabel: string | null;
  normalizedDetectedLabel: string | null;
  transcription: string;
  pageNumber: number;
  readingOrder: number;
  regions: PageRegion[];
  extractionConfidence: number;
  continuesFromPrevious: boolean;
  continuesToNext: boolean;
};

export type MappingStatus = "answered" | "unanswered" | "needs_review";

export type AnswerMapping = {
  questionId: string;
  answerBlockIds: string[];
  status: MappingStatus;
  method: "exact_label" | "label_alias" | "semantic" | "manual" | "none";
  confidence: number;
  reason: string;
};

export type Grade = {
  questionId: string;
  awardedMarks: number | null;
  maxMarks: number | null;
  verdict: "correct" | "partially_correct" | "incorrect" | "not_graded";
  feedback: string;
  evidence: string[];
  confidence: number;
};

export type AssessmentResult = {
  questions: ExtractedQuestion[];
  answers: AnswerBlock[];
  mappings: AnswerMapping[];
  grades: Grade[];
  unmatchedAnswerBlockIds: string[];
  warnings: string[];
};

export type ProcessingPhase =
  | "idle"
  | "preparing"
  | "questions"
  | "answers"
  | "consolidating"
  | "mapping"
  | "grading"
  | "complete"
  | "error";

export type ApiSuccess<T> = {
  ok: true;
  data: T;
  requestId: string;
};

export type ApiFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
  requestId: string;
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;
