package com.school.sms.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDate;

@TableName("exam")
public class Exam {
    @TableId(type = IdType.AUTO)
    private Integer id;
    private String name;
    private LocalDate examDate;
    private String term;

    public Integer getId() { return id; }
    public void setId(Integer id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public LocalDate getExamDate() { return examDate; }
    public void setExamDate(LocalDate examDate) { this.examDate = examDate; }
    public String getTerm() { return term; }
    public void setTerm(String term) { this.term = term; }
}
