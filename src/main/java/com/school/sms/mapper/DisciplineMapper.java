package com.school.sms.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.school.sms.entity.Discipline;
import java.util.List;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

public interface DisciplineMapper extends BaseMapper<Discipline> {

    @Select("<script>SELECT d.*, st.name AS student_name, c.name AS class_name FROM discipline d " +
            "JOIN student st ON d.student_id = st.id JOIN class c ON st.class_id = c.id " +
            "<where>" +
            "<if test='studentId != null'> AND d.student_id = #{studentId}</if>" +
            "<if test='classId != null'> AND st.class_id = #{classId}</if>" +
            "</where> ORDER BY d.event_date DESC</script>")
    List<Discipline> selectWithNames(@Param("studentId") Integer studentId, @Param("classId") Integer classId);
}
