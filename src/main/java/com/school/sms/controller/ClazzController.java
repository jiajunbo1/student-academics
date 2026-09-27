package com.school.sms.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.school.sms.entity.Clazz;
import com.school.sms.entity.Student;
import com.school.sms.mapper.ClazzMapper;
import com.school.sms.mapper.StudentMapper;
import com.school.sms.mapper.TeacherMapper;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;

@Controller
@RequestMapping("/clazz")
public class ClazzController {

    private final ClazzMapper clazzMapper;
    private final StudentMapper studentMapper;
    private final TeacherMapper teacherMapper;

    public ClazzController(ClazzMapper clazzMapper, StudentMapper studentMapper, TeacherMapper teacherMapper) {
        this.clazzMapper = clazzMapper;
        this.studentMapper = studentMapper;
        this.teacherMapper = teacherMapper;
    }

    @GetMapping
    public String list(Model model) {
        model.addAttribute("classes", clazzMapper.selectAllWithInfo());
        model.addAttribute("teachers", teacherMapper.selectList(null));
        return "clazz/list";
    }

    @PostMapping("/save")
    public String save(@ModelAttribute Clazz clazz) {
        if (clazz.getId() == null) {
            clazzMapper.insert(clazz);
        } else {
            clazzMapper.updateById(clazz);
        }
        return "redirect:/clazz";
    }

    @GetMapping("/delete/{id}")
    public String delete(@PathVariable Integer id) {
        Long count = studentMapper.selectCount(new LambdaQueryWrapper<Student>().eq(Student::getClassId, id));
        if (count > 0) {
            return "redirect:/clazz?error=该班还有学生，不能删除";
        }
        clazzMapper.deleteById(id);
        return "redirect:/clazz";
    }
}
