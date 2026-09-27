package com.school.sms.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.school.sms.dto.ScoreView;
import com.school.sms.entity.Score;
import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

public interface ScoreMapper extends BaseMapper<Score> {

    String VIEW_BASE = "SELECT sc.exam_id, e.name AS exam_name, st.id AS student_id, st.student_no, " +
            "st.name AS student_name, st.class_id, c.name AS class_name, " +
            "sc.subject_id, sub.name AS subject_name, sc.score " +
            "FROM score sc " +
            "JOIN student st ON sc.student_id = st.id " +
            "JOIN class c ON st.class_id = c.id " +
            "JOIN subject sub ON sc.subject_id = sub.id " +
            "JOIN exam e ON sc.exam_id = e.id ";

    @Select("<script>" + VIEW_BASE +
            "<where>" +
            "<if test='examId != null'> AND sc.exam_id = #{examId}</if>" +
            "<if test='classId != null'> AND st.class_id = #{classId}</if>" +
            "<if test='studentId != null'> AND st.id = #{studentId}</if>" +
            "</where>" +
            " ORDER BY e.exam_date, st.student_no, sub.id</script>")
    List<ScoreView> selectViews(@Param("examId") Integer examId, @Param("classId") Integer classId,
                                @Param("studentId") Integer studentId);

    @Select("SELECT sub.name AS name, ROUND(AVG(sc.score),1) AS value FROM score sc " +
            "JOIN subject sub ON sc.subject_id = sub.id " +
            "WHERE sc.exam_id = #{examId} GROUP BY sub.id, sub.name ORDER BY sub.id")
    List<Map<String, Object>> avgBySubject(@Param("examId") Integer examId);
}
