export interface Me {
  id: string; username: string; displayName: string;
  role: 'ADMIN' | 'TEACHER' | 'STUDENT';
  studentId: string | null; status: string; mustChange: boolean;
  lockedUntil: string | null; lastLoginAt: string | null; createdAt: string | null;
}

export interface AccountRow extends Me {
  studentName: string; studentNo: string; className: string;
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

export interface AttendanceRow {
  id: string; student_id: string; att_date: string; status: string;
  remark: string | null; studentName?: string; className?: string;
}

export interface DisciplineRow {
  id: string; student_id: string; type: string; content: string;
  event_date: string; studentName?: string; className?: string;
}

export interface ActivityRow {
  id: string; student_id: string; name: string; category: string;
  event_date: string; studentName?: string; className?: string;
}

export interface ReviewRow {
  id: string; student_id: string; user_id: string | null; teacher_name: string | null;
  term: string; content: string; created_at: string;
  studentName?: string; className?: string;
}

export interface SheetRow {
  studentId: string; studentNo: string; studentName: string; className: string;
  cells: Record<string, number | null>; total: number; count: number;
  avg: number; classRank: number;
}

export interface DashboardData {
  counts: { students: number; classes: number; teachers: number; exams: number };
  lastExam: { id: string; name: string; exam_date: string } | null;
  subjectAvgs: { name: string; avg: number }[];
  attStats: { name: string; value: number }[];
  recentDiscipline: (DisciplineRow & { studentName: string })[];
  recentActivity: (ActivityRow & { studentName: string })[];
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
  attendances: AttendanceRow[];
  attSummary: { name: string; value: number }[];
  disciplines: DisciplineRow[];
  discSummary: { name: string; value: number }[];
  activities: ActivityRow[];
  reviews: ReviewRow[];
}
