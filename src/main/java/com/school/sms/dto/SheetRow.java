package com.school.sms.dto;

import java.math.BigDecimal;
import java.util.LinkedHashMap;

/** 成绩单行：某考试某学生的各科成绩、总分与班内排名 */
public class SheetRow {
    private Integer studentId;
    private String studentNo;
    private String studentName;
    private String className;
    private final LinkedHashMap<String, BigDecimal> subjects = new LinkedHashMap<>();
    private BigDecimal total = BigDecimal.ZERO;
    private BigDecimal avg = BigDecimal.ZERO;
    private Integer classRank;

    public Integer getStudentId() { return studentId; }
    public void setStudentId(Integer studentId) { this.studentId = studentId; }
    public String getStudentNo() { return studentNo; }
    public void setStudentNo(String studentNo) { this.studentNo = studentNo; }
    public String getStudentName() { return studentName; }
    public void setStudentName(String studentName) { this.studentName = studentName; }
    public String getClassName() { return className; }
    public void setClassName(String className) { this.className = className; }
    public LinkedHashMap<String, BigDecimal> getSubjects() { return subjects; }
    public BigDecimal getTotal() { return total; }
    public void setTotal(BigDecimal total) { this.total = total; }
    public BigDecimal getAvg() { return avg; }
    public void setAvg(BigDecimal avg) { this.avg = avg; }
    public Integer getClassRank() { return classRank; }
    public void setClassRank(Integer classRank) { this.classRank = classRank; }
}
