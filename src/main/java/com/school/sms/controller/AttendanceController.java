package com.school.sms.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.school.sms.entity.Attendance;
import com.school.sms.entity.Student;
import com.school.sms.mapper.AttendanceMapper;
import com.school.sms.mapper.ClazzMapper;
import com.school.sms.mapper.StudentMapper;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;

@Controller
@RequestMapping("/attendance")
public class AttendanceController {

    static final String[] STATUSES = {"出勤", "迟到", "早退", "请假", "缺勤"};

    private final AttendanceMapper attendanceMapper;
    private final StudentMapper studentMapper;
    private final ClazzMapper clazzMapper;

    public AttendanceController(AttendanceMapper attendanceMapper, StudentMapper studentMapper, ClazzMapper clazzMapper) {
        this.attendanceMapper = attendanceMapper;
        this.studentMapper = studentMapper;
        this.clazzMapper = clazzMapper;
    }

    @GetMapping
    public String list(@RequestParam(required = false) LocalDate date,
                       @RequestParam(required = false) Integer classId,
                       Model model) {
        model.addAttribute("records", attendanceMapper.selectWithNames(date, classId, null));
        model.addAttribute("date", date);
        model.addAttribute("classId", classId);
        model.addAttribute("classes", clazzMapper.selectList(null));
        return "attendance/list";
    }

    @GetMapping("/register")
    public String register(@RequestParam Integer classId,
                           @RequestParam(required = false) @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) LocalDate date,
                           Model model) {
        if (date == null) {
            date = LocalDate.now();
        }
        List<Student> students = studentMapper.selectList(new LambdaQueryWrapper<Student>()
                .eq(Student::getClassId, classId).orderByAsc(Student::getStudentNo));
        Map<Integer, Attendance> existing = new HashMap<>();
        for (Attendance a : attendanceMapper.selectWithNames(date, classId, null)) {
            existing.put(a.getStudentId(), a);
        }
        model.addAttribute("classId", classId);
        model.addAttribute("date", date);
        model.addAttribute("students", students);
        model.addAttribute("existing", existing);
        model.addAttribute("statuses", STATUSES);
        model.addAttribute("classes", clazzMapper.selectList(null));
        return "attendance/register";
    }

    @PostMapping("/register")
    public String registerSave(@RequestParam Integer classId,
                               @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
                               @RequestParam Map<String, String> allParams) {
        List<Student> students = studentMapper.selectList(new LambdaQueryWrapper<Student>()
                .eq(Student::getClassId, classId));
        for (Student st : students) {
            String status = allParams.get("st" + st.getId());
            if (status == null || !List.of(STATUSES).contains(status)) {
                continue;
            }
            String remark = allParams.get("rm" + st.getId());
            Attendance old = attendanceMapper.selectOne(new LambdaQueryWrapper<Attendance>()
                    .eq(Attendance::getStudentId, st.getId()).eq(Attendance::getAttDate, date).last("LIMIT 1"));
            if (old == null) {
                Attendance a = new Attendance();
                a.setStudentId(st.getId());
                a.setAttDate(date);
                a.setStatus(status);
                a.setRemark(remark);
                attendanceMapper.insert(a);
            } else {
                old.setStatus(status);
                old.setRemark(remark);
                attendanceMapper.updateById(old);
            }
        }
        return "redirect:/attendance?date=" + date + "&classId=" + classId;
    }
}
