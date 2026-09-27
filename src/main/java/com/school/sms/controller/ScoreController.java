package com.school.sms.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.school.sms.dto.ScoreView;
import com.school.sms.dto.SheetRow;
import com.school.sms.entity.Exam;
import com.school.sms.entity.Score;
import com.school.sms.entity.Student;
import com.school.sms.mapper.*;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;

@Controller
@RequestMapping("/score")
public class ScoreController {

    private final ScoreMapper scoreMapper;
    private final StudentMapper studentMapper;
    private final SubjectMapper subjectMapper;
    private final ExamMapper examMapper;
    private final ClazzMapper clazzMapper;

    public ScoreController(ScoreMapper scoreMapper, StudentMapper studentMapper, SubjectMapper subjectMapper,
                           ExamMapper examMapper, ClazzMapper clazzMapper) {
        this.scoreMapper = scoreMapper;
        this.studentMapper = studentMapper;
        this.subjectMapper = subjectMapper;
        this.examMapper = examMapper;
        this.clazzMapper = clazzMapper;
    }

    /** 成绩单：按考试（可再按班级）展示各科成绩、总分、班内排名 */
    @GetMapping
    public String sheet(@RequestParam(required = false) Integer examId,
                        @RequestParam(required = false) Integer classId,
                        Model model) {
        List<Exam> exams = examMapper.selectList(new LambdaQueryWrapper<Exam>().orderByDesc(Exam::getExamDate));
        if (examId == null && !exams.isEmpty()) {
            examId = exams.get(0).getId();
        }
        model.addAttribute("exams", exams);
        model.addAttribute("examId", examId);
        model.addAttribute("classId", classId);
        model.addAttribute("classes", clazzMapper.selectList(null));
        model.addAttribute("subjects", subjectMapper.selectList(null));
        if (examId == null) {
            model.addAttribute("rows", List.of());
            model.addAttribute("examSubjects", List.of());
            return "score/sheet";
        }
        List<ScoreView> views = scoreMapper.selectViews(examId, classId, null);

        LinkedHashSet<String> examSubjects = new LinkedHashSet<>();
        Map<Integer, SheetRow> rowMap = new LinkedHashMap<>();
        for (ScoreView v : views) {
            examSubjects.add(v.getSubjectName());
            SheetRow row = rowMap.computeIfAbsent(v.getStudentId(), k -> {
                SheetRow r = new SheetRow();
                r.setStudentId(v.getStudentId());
                r.setStudentNo(v.getStudentNo());
                r.setStudentName(v.getStudentName());
                r.setClassName(v.getClassName());
                return r;
            });
            row.getSubjects().put(v.getSubjectName(), v.getScore());
            row.setTotal(row.getTotal().add(v.getScore()));
        }
        int subjectCount = Math.max(examSubjects.size(), 1);
        List<SheetRow> rows = new ArrayList<>(rowMap.values());
        rows.forEach(r -> {
            for (String s : examSubjects) {
                r.getSubjects().putIfAbsent(s, null);
            }
            r.setAvg(r.getTotal().divide(BigDecimal.valueOf(subjectCount), 1, RoundingMode.HALF_UP));
        });
        // 班内排名（按班分组，总分降序，并列同名次）
        Map<String, List<SheetRow>> byClass = new LinkedHashMap<>();
        rows.forEach(r -> byClass.computeIfAbsent(r.getClassName(), k -> new ArrayList<>()).add(r));
        byClass.values().forEach(list -> {
            list.sort(Comparator.comparing(SheetRow::getTotal).reversed());
            int rank = 0;
            BigDecimal prev = null;
            for (int i = 0; i < list.size(); i++) {
                if (prev == null || list.get(i).getTotal().compareTo(prev) < 0) {
                    rank = i + 1;
                    prev = list.get(i).getTotal();
                }
                list.get(i).setClassRank(rank);
            }
        });
        rows.sort(Comparator.comparing(SheetRow::getClassName).thenComparing(SheetRow::getClassRank));
        model.addAttribute("rows", rows);
        model.addAttribute("examSubjects", examSubjects);
        return "score/sheet";
    }

    /** 成绩录入：某考试某班级某科目，整班名单一次录入 */
    @GetMapping("/input")
    public String inputForm(@RequestParam Integer examId, @RequestParam Integer classId,
                            @RequestParam Integer subjectId, Model model) {
        List<Student> students = studentMapper.selectList(new LambdaQueryWrapper<Student>()
                .eq(Student::getClassId, classId).orderByAsc(Student::getStudentNo));
        Map<Integer, BigDecimal> existing = new HashMap<>();
        for (ScoreView v : scoreMapper.selectViews(examId, classId, null)) {
            if (Objects.equals(v.getSubjectId(), subjectId)) {
                existing.put(v.getStudentId(), v.getScore());
            }
        }
        model.addAttribute("examId", examId);
        model.addAttribute("classId", classId);
        model.addAttribute("subjectId", subjectId);
        model.addAttribute("students", students);
        model.addAttribute("existing", existing);
        model.addAttribute("exams", examMapper.selectList(new LambdaQueryWrapper<Exam>().orderByDesc(Exam::getExamDate)));
        model.addAttribute("classes", clazzMapper.selectList(null));
        model.addAttribute("subjects", subjectMapper.selectList(null));
        return "score/input";
    }

    @PostMapping("/input")
    public String inputSave(@RequestParam Integer examId, @RequestParam Integer subjectId,
                            @RequestParam(required = false) Map<String, String> allParams) {
        allParams.forEach((key, val) -> {
            if (!key.matches("s\\d+") || val == null || val.isBlank()) {
                return;
            }
            Integer studentId = Integer.valueOf(key.substring(1));
            BigDecimal score = new BigDecimal(val);
            Score old = scoreMapper.selectOne(new LambdaQueryWrapper<Score>()
                    .eq(Score::getStudentId, studentId).eq(Score::getSubjectId, subjectId).eq(Score::getExamId, examId)
                    .last("LIMIT 1"));
            if (old == null) {
                Score s = new Score();
                s.setStudentId(studentId);
                s.setSubjectId(subjectId);
                s.setExamId(examId);
                s.setScore(score);
                scoreMapper.insert(s);
            } else {
                old.setScore(score);
                scoreMapper.updateById(old);
            }
        });
        return "redirect:/score?examId=" + examId;
    }

    /** 新增考试批次 */
    @PostMapping("/exam/save")
    public String saveExam(@ModelAttribute Exam exam) {
        examMapper.insert(exam);
        return "redirect:/score";
    }
}
