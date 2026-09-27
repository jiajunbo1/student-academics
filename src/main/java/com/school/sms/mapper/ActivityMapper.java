package com.school.sms.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.school.sms.entity.Activity;
import java.util.List;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

public interface ActivityMapper extends BaseMapper<Activity> {

    @Select("<script>SELECT a.*, st.name AS student_name, c.name AS class_name FROM activity a " +
            "JOIN student st ON a.student_id = st.id JOIN class c ON st.class_id = c.id " +
            "<where>" +
            "<if test='studentId != null'> AND a.student_id = #{studentId}</if>" +
            "<if test='classId != null'> AND st.class_id = #{classId}</if>" +
            "</where> ORDER BY a.event_date DESC</script>")
    List<Activity> selectWithNames(@Param("studentId") Integer studentId, @Param("classId") Integer classId);
}
