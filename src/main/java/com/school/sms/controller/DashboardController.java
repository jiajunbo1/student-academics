package com.school.sms.controller;

import com.school.sms.entity.Exam;
import com.school.sms.mapper.*;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class DashboardController {

    private final StudentMapper studentMapper;
    private final ClazzMapper clazzMapper;
    private final TeacherMapper teacherMapper;
    private final ExamMapper examMapper;
    private final ScoreMapper scoreMapper;
    private final AttendanceMapper attendanceMapper;
    private final DisciplineMapper disciplineMapper;
    private final ActivityMapper activityMapper;

    public DashboardController(StudentMapper studentMapper, ClazzMapper clazzMapper, TeacherMapper teacherMapper,
                               ExamMapper examMapper, ScoreMapper scoreMapper, AttendanceMapper attendanceMapper,
                               DisciplineMapper disciplineMapper, ActivityMapper activityMapper) {
        this.studentMapper = studentMapper;
        this.clazzMapper = clazzMapper;
        this.teacherMapper = teacherMapper;
        this.examMapper = examMapper;
        this.scoreMapper = scoreMapper;
        this.attendanceMapper = attendanceMapper;
        this.disciplineMapper = disciplineMapper;
        this.activityMapper = activityMapper;
    }

    @GetMapping("/")
    public String index(Model model) {
        model.addAttribute("studentCount", studentMapper.selectCount(null));
        model.addAttribute("classCount", clazzMapper.selectCount(null));
        model.addAttribute("teacherCount", teacherMapper.selectCount(null));
        model.addAttribute("examCount", examMapper.selectCount(null));

        Exam lastExam = examMapper.selectLatestWithScores();
        model.addAttribute("lastExam", lastExam);
        if (lastExam != null) {
            List<Map<String, Object>> avgRows = scoreMapper.avgBySubject(lastExam.getId());
            model.addAttribute("subjectNames", avgRows.stream().map(r -> String.valueOf(r.get("name"))).toList());
            model.addAttribute("subjectAvgs", avgRows.stream().map(r -> r.get("value")).toList());
        }
        model.addAttribute("attStats", attendanceMapper.countByStatus());
        model.addAttribute("recentDiscipline", disciplineMapper.selectWithNames(null, null).stream().limit(5).toList());
        model.addAttribute("recentActivity", activityMapper.selectWithNames(null, null).stream().limit(5).toList());
        return "dashboard";
    }
}
