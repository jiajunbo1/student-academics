package com.school.sms.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.school.sms.entity.Teacher;
import com.school.sms.mapper.SubjectMapper;
import com.school.sms.mapper.TeacherMapper;
import jakarta.servlet.http.HttpSession;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

@Controller
public class LoginController {

    private final TeacherMapper teacherMapper;
    private final SubjectMapper subjectMapper;

    public LoginController(TeacherMapper teacherMapper, SubjectMapper subjectMapper) {
        this.teacherMapper = teacherMapper;
        this.subjectMapper = subjectMapper;
    }

    @GetMapping("/login")
    public String loginPage(HttpSession session) {
        if (session.getAttribute("loginTeacher") != null) {
            return "redirect:/";
        }
        return "login";
    }

    @PostMapping("/login")
    public String doLogin(@RequestParam String username, @RequestParam String password,
                          HttpSession session, Model model) {
        Teacher teacher = teacherMapper.selectOne(new LambdaQueryWrapper<Teacher>()
                .eq(Teacher::getUsername, username).last("LIMIT 1"));
        if (teacher == null || !teacher.getPassword().equals(password)) {
            model.addAttribute("error", "账号或密码错误");
            model.addAttribute("username", username);
            return "login";
        }
        if (teacher.getSubjectId() != null) {
            teacher.setSubjectName(subjectMapper.selectById(teacher.getSubjectId()).getName());
        }
        session.setAttribute("loginTeacher", teacher);
        return "redirect:/";
    }

    @GetMapping("/logout")
    public String logout(HttpSession session) {
        session.invalidate();
        return "redirect:/login";
    }
}
