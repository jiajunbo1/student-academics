package com.school.sms.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

@TableName("class")
public class Clazz {
    @TableId(type = IdType.AUTO)
    private Integer id;
    private String name;
    private String grade;
    private Integer headTeacherId;

    @TableField(exist = false)
    private String headTeacherName;
    @TableField(exist = false)
    private Integer studentCount;

    public Integer getId() { return id; }
    public void setId(Integer id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getGrade() { return grade; }
    public void setGrade(String grade) { this.grade = grade; }
    public Integer getHeadTeacherId() { return headTeacherId; }
    public void setHeadTeacherId(Integer headTeacherId) { this.headTeacherId = headTeacherId; }
    public String getHeadTeacherName() { return headTeacherName; }
    public void setHeadTeacherName(String headTeacherName) { this.headTeacherName = headTeacherName; }
    public Integer getStudentCount() { return studentCount; }
    public void setStudentCount(Integer studentCount) { this.studentCount = studentCount; }
}
