package com.school.sms.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.school.sms.entity.Attendance;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

public interface AttendanceMapper extends BaseMapper<Attendance> {

    @Select("<script>SELECT a.*, st.name AS student_name, c.name AS class_name FROM attendance a " +
            "JOIN student st ON a.student_id = st.id JOIN class c ON st.class_id = c.id " +
            "<where>" +
            "<if test='date != null'> AND a.att_date = #{date}</if>" +
            "<if test='classId != null'> AND st.class_id = #{classId}</if>" +
            "<if test='studentId != null'> AND a.student_id = #{studentId}</if>" +
            "</where>" +
            " ORDER BY a.att_date DESC, c.name, st.student_no</script>")
    List<Attendance> selectWithNames(@Param("date") LocalDate date, @Param("classId") Integer classId,
                                     @Param("studentId") Integer studentId);

    @Select("SELECT status AS name, COUNT(*) AS value FROM attendance GROUP BY status")
    List<Map<String, Object>> countByStatus();
}
