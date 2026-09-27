package com.school.sms.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.school.sms.entity.Student;
import java.util.List;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

public interface StudentMapper extends BaseMapper<Student> {

    String SELECT_BASE = "SELECT s.*, c.name AS class_name FROM student s " +
            "LEFT JOIN class c ON s.class_id = c.id ";

    @Select("<script>" + SELECT_BASE +
            "<where>" +
            "<if test='kw != null and kw != \"\"'> AND (s.name LIKE CONCAT('%',#{kw},'%') OR s.student_no LIKE CONCAT('%',#{kw},'%'))</if>" +
            "<if test='classId != null'> AND s.class_id = #{classId}</if>" +
            "<if test='status != null and status != \"\"'> AND s.status = #{status}</if>" +
            "</where>" +
            " ORDER BY s.class_id, s.student_no</script>")
    List<Student> selectByFilter(@Param("kw") String kw, @Param("classId") Integer classId, @Param("status") String status);

    @Select(SELECT_BASE + " WHERE s.id = #{id}")
    Student selectWithClass(@Param("id") Integer id);
}
