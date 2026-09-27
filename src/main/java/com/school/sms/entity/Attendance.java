package com.school.sms.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDate;

@TableName("attendance")
public class Attendance {
    @TableId(type = IdType.AUTO)
    private Integer id;
    private Integer studentId;
    private LocalDate attDate;
    private String status;
    private String remark;

    @TableField(exist = false)
    private String studentName;
    @TableField(exist = false)
    private String className;

    public Integer getId() { return id; }
    public void setId(Integer id) { this.id = id; }
    public Integer getStudentId() { return studentId; }
    public void setStudentId(Integer studentId) { this.studentId = studentId; }
    public LocalDate getAttDate() { return attDate; }
    public void setAttDate(LocalDate attDate) { this.attDate = attDate; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getRemark() { return remark; }
    public void setRemark(String remark) { this.remark = remark; }
    public String getStudentName() { return studentName; }
    public void setStudentName(String studentName) { this.studentName = studentName; }
    public String getClassName() { return className; }
    public void setClassName(String className) { this.className = className; }
}
