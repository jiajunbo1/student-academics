export interface Me {
  id: string; username: string; displayName: string;
  role: 'ADMIN' | 'TEACHER' | 'STUDENT';
  studentId: string | null; status: string; mustChange: boolean;
  lockedUntil: string | null; lastLoginAt: string | null; createdAt: string | null;
}

export interface TeachingAssignment {
  subjectId: string; classId: string;
  subjectName?: string; className?: string;
}

export interface AccountRow extends Me {
  studentName: string; studentNo: string; className: string;
  assignments: TeachingAssignment[]; subjectNames: string[]; classNames: string[];
}

export interface ClassRow {
  id: string; name: string; grade: string; head_user_id: string | null;
  created_at?: string; studentCount: number; headTeacherName: string;
}

export interface StudentRow {
  id: string; student_no: string; name: string; gender: string;
  birth_date: string | null; class_id: string; enroll_year: number | null;
  address: string | null; phone: string | null; guardian_name: string | null;
  guardian_phone: string | null; status: string; created_at?: string;
  className?: string;
}

export interface Subject { id: string; name: string; code: string; sort: number; }
export interface Exam { id: string; name: string; exam_date: string; term: string; }

/** refdata：subjects 是「能看的」（全站科目名与列表），mySubjectIds 是「能改的」（本人任教科目） */
export interface RefData { subjects: Subject[]; mySubjectIds: string[]; exams: Exam[]; }

export interface ScoreRow {
  id: string; student_id: string; subject_id: string; exam_id: string;
  score: number; created_at?: string;
}

export interface SheetRow {
  studentId: string; studentNo: string; studentName: string; className: string;
  cells: Record<string, number | null>; total: number; count: number;
  avg: number; classRank: number;
}

export interface SubjectTrend {
  subject: { id: string; name: string };
  exams: { id: string; name: string; examDate: string }[];
  classes: { id: string; name: string }[];
  /** classId -> examId -> 班级平均分（分） */
  classAvg: Record<string, Record<string, number | null>>;
  students: {
    id: string; name: string; studentNo: string; classId: string; className: string;
    /** examId -> 得分（十分之一分） */
    scores: Record<string, number | null>;
  }[];
}

export interface DashboardData {
  /** teachers 只有管理员拿得到（账号数量是管理数据，教师端不下发也不显示） */
  counts: { students: number; classes: number; teachers?: number; exams: number };
  lastExam: { id: string; name: string; exam_date: string } | null;
  subjectAvgs: { name: string; avg: number }[];
}

export interface PortalRecord {
  examId: string; examName: string; examDate: string; term: string;
  cells: Record<string, number | null>; total: number; count: number;
  avg: number; classAvg: number; rank: number | null; classSize: number;
}

export interface PortalData {
  student: {
    name: string; studentNo: string; gender: string;
    enrollYear: number | null; status: string; className: string;
  };
  subjects: { id: string; name: string }[];
  records: PortalRecord[];
  recitations: PortalDailyItem[];
  homeworks: PortalDailyItem[];
}

// ---------- 日常登记（背诵 / 作业）----------
export type DailyKind = 'recitation' | 'homework';

export interface DailyListRow {
  id: string; classId: string; className: string;
  subjectId: string; subjectName: string;
  title: string; part: string; assignDate: string; dueDate: string; note: string;
  total: number; counts: Record<string, number>; passCount: number; canDelete: boolean;
}

export interface DailyRecord {
  status: string; attempt: number; checkDate: string; planDate: string;
  note: string; recordedByName: string;
}

export interface DailySheet {
  kind: DailyKind;
  list: DailyListRow;
  rows: { studentId: string; studentNo: string; name: string; status: string; record: DailyRecord | null }[];
  statuses: string[]; pass: string;
  hasPart: boolean; hasAttempt: boolean; hasPlan: boolean;
}

export interface DailyGrid {
  kind: DailyKind; className: string;
  lists: { id: string; title: string; part: string; assignDate: string }[];
  rows: { studentId: string; studentNo: string; name: string; cells: Record<string, string | null> }[];
  statuses: string[]; pass: string;
}

/** 学生端：本人的单次背诵 / 作业记录 */
export interface PortalDailyItem {
  title: string; part: string; status: string; attempt: number;
  assignDate: string; dueDate: string; checkDate: string; planDate: string;
  note: string; subjectName: string;
}
