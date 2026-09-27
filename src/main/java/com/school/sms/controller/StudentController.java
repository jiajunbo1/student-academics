package com.school.sms.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.school.sms.dto.ScoreView;
import com.school.sms.entity.*;
import com.school.sms.mapper.*;
import java.util.List;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;

@Controller
@RequestMapping("/student")
public class StudentController {

    private final StudentMapper studentMapper;
    private final ClazzMapper clazzMapper;
    private final ScoreMapper scoreMapper;
    private final AttendanceMapper attendanceMapper;
    private final DisciplineMapper disciplineMapper;
    private final ActivityMapper activityMapper;
    private final ReviewMapper reviewMapper;

    public StudentController(StudentMapper studentMapper, ClazzMapper clazzMapper, ScoreMapper scoreMapper,
                             AttendanceMapper attendanceMapper, DisciplineMapper disciplineMapper,
                             ActivityMapper activityMapper, ReviewMapper reviewMapper) {
        this.studentMapper = studentMapper;
        this.clazzMapper = clazzMapper;
        this.scoreMapper = scoreMapper;
        this.attendanceMapper = attendanceMapper;
        this.disciplineMapper = disciplineMapper;
        this.activityMapper = activityMapper;
        this.reviewMapper = reviewMapper;
    }

    @GetMapping
    public String list(@RequestParam(required = false) String kw,
                       @RequestParam(required = false) Integer classId,
                       @RequestParam(required = false) String status,
                       Model model) {
        model.addAttribute("students", studentMapper.selectByFilter(kw, classId, status));
        model.addAttribute("classes", clazzMapper.selectList(null));
        model.addAttribute("kw", kw);
        model.addAttribute("classId", classId);
        model.addAttribute("status", status);
        return "student/list";
    }

    @GetMapping("/new")
    public String formNew(Model model) {
        return formEdit(null, model);
    }

    @GetMapping("/edit/{id}")
    public String formEdit(@PathVariable(required = false) Integer id, Model model) {
        model.addAttribute("student", id == null ? new Student() : studentMapper.selectById(id));
        model.addAttribute("classes", clazzMapper.selectList(null));
        return "student/form";
    }

    @PostMapping("/save")
    public String save(@ModelAttribute Student student) {
        if (student.getPhoto() == null || student.getPhoto().isBlank()) {
            student.setPhoto(student.getName().substring(0, 1));
        }
        if (student.getId() == null) {
            studentMapper.insert(student);
        } else {
            studentMapper.updateById(student);
        }
        return "redirect:/student";
    }

    @GetMapping("/delete/{id}")
    public String delete(@PathVariable Integer id) {
        scoreMapper.delete(new LambdaQueryWrapper<Score>().eq(Score::getStudentId, id));
        attendanceMapper.delete(new LambdaQueryWrapper<Attendance>().eq(Attendance::getStudentId, id));
        disciplineMapper.delete(new LambdaQueryWrapper<Discipline>().eq(Discipline::getStudentId, id));
        activityMapper.delete(new LambdaQueryWrapper<Activity>().eq(Activity::getStudentId, id));
        reviewMapper.delete(new LambdaQueryWrapper<Review>().eq(Review::getStudentId, id));
        studentMapper.deleteById(id);
        return "redirect:/student";
    }

    @GetMapping("/{id}")
    public String detail(@PathVariable Integer id, Model model) {
        Student student = studentMapper.selectWithClass(id);
        if (student == null) {
            return "redirect:/student";
        }
        List<ScoreView> scores = scoreMapper.selectViews(null, null, id);
        model.addAttribute("student", student);
        model.addAttribute("scores", scores);
        model.addAttribute("attendances", attendanceMapper.selectWithNames(null, null, id));
        model.addAttribute("disciplines", disciplineMapper.selectWithNames(id, null));
        model.addAttribute("activities", activityMapper.selectWithNames(id, null));
        model.addAttribute("reviews", reviewMapper.selectWithNames(id, null));
        // 趋势图数据: 按考试聚合总分
        var byExam = new java.util.LinkedHashMap<Integer, java.math.BigDecimal>();
        var examNames = new java.util.LinkedHashMap<Integer, String>();
        for (ScoreView v : scores) {
            byExam.merge(v.getExamId(), v.getScore(), java.math.BigDecimal::add);
            examNames.put(v.getExamId(), v.getExamName());
        }
        model.addAttribute("trendLabels", examNames.values().stream().toList());
        model.addAttribute("trendTotals", byExam.values().stream().map(java.math.BigDecimal::doubleValue).toList());
        return "student/detail";
    }
}
