package com.school.sms.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.school.sms.entity.Review;
import java.util.List;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

public interface ReviewMapper extends BaseMapper<Review> {

    @Select("<script>SELECT r.*, st.name AS student_name, t.real_name AS teacher_name, c.name AS class_name " +
            "FROM review r JOIN student st ON r.student_id = st.id " +
            "JOIN teacher t ON r.teacher_id = t.id JOIN class c ON st.class_id = c.id " +
            "<where>" +
            "<if test='studentId != null'> AND r.student_id = #{studentId}</if>" +
            "<if test='classId != null'> AND st.class_id = #{classId}</if>" +
            "</where> ORDER BY r.id DESC</script>")
    List<Review> selectWithNames(@Param("studentId") Integer studentId, @Param("classId") Integer classId);
}
