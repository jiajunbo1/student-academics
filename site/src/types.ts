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
  counts: { students: number; classes: number; teachers: number; exams: number };
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
}
