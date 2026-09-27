package com.school.sms.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.school.sms.entity.*;
import com.school.sms.mapper.*;
import jakarta.servlet.http.HttpSession;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;

/** 综合素质：奖惩 / 活动 / 评语 */
@Controller
@RequestMapping("/quality")
public class QualityController {

    private final DisciplineMapper disciplineMapper;
    private final ActivityMapper activityMapper;
    private final ReviewMapper reviewMapper;
    private final StudentMapper studentMapper;
    private final ClazzMapper clazzMapper;
    private final TeacherMapper teacherMapper;

    public QualityController(DisciplineMapper disciplineMapper, ActivityMapper activityMapper,
                             ReviewMapper reviewMapper, StudentMapper studentMapper,
                             ClazzMapper clazzMapper, TeacherMapper teacherMapper) {
        this.disciplineMapper = disciplineMapper;
        this.activityMapper = activityMapper;
        this.reviewMapper = reviewMapper;
        this.studentMapper = studentMapper;
        this.clazzMapper = clazzMapper;
        this.teacherMapper = teacherMapper;
    }

    @ModelAttribute("classes")
    public Object classes() {
        return clazzMapper.selectList(null);
    }

    @ModelAttribute("students")
    public Object students() {
        return studentMapper.selectList(new LambdaQueryWrapper<Student>().orderByAsc(Student::getStudentNo));
    }

    @ModelAttribute("teachers")
    public Object teachers() {
        return teacherMapper.selectList(null);
    }

    @GetMapping
    public String index(@RequestParam(required = false) Integer classId, Model model) {
        model.addAttribute("classId", classId);
        model.addAttribute("disciplines", disciplineMapper.selectWithNames(null, classId));
        model.addAttribute("activities", activityMapper.selectWithNames(null, classId));
        model.addAttribute("reviews", reviewMapper.selectWithNames(null, classId));
        return "quality/list";
    }

    @PostMapping("/discipline")
    public String addDiscipline(@ModelAttribute Discipline d) {
        disciplineMapper.insert(d);
        return "redirect:/quality";
    }

    @GetMapping("/discipline/delete/{id}")
    public String delDiscipline(@PathVariable Integer id) {
        disciplineMapper.deleteById(id);
        return "redirect:/quality";
    }

    @PostMapping("/activity")
    public String addActivity(@ModelAttribute Activity a) {
        activityMapper.insert(a);
        return "redirect:/quality";
    }

    @GetMapping("/activity/delete/{id}")
    public String delActivity(@PathVariable Integer id) {
        activityMapper.deleteById(id);
        return "redirect:/quality";
    }

    @PostMapping("/review")
    public String addReview(@ModelAttribute Review r, HttpSession session) {
        if (r.getTeacherId() == null) {
            Teacher t = (Teacher) session.getAttribute("loginTeacher");
            r.setTeacherId(t.getId());
        }
        reviewMapper.insert(r);
        return "redirect:/quality";
    }

    @GetMapping("/review/delete/{id}")
    public String delReview(@PathVariable Integer id) {
        reviewMapper.deleteById(id);
        return "redirect:/quality";
    }
}
