package com.school.sms.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.school.sms.entity.Exam;
import org.apache.ibatis.annotations.Select;

public interface ExamMapper extends BaseMapper<Exam> {

    @Select("SELECT e.* FROM exam e JOIN score sc ON sc.exam_id = e.id " +
            "GROUP BY e.id, e.name, e.exam_date, e.term ORDER BY e.exam_date DESC LIMIT 1")
    Exam selectLatestWithScores();
}
