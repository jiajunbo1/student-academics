package com.school.sms.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.school.sms.entity.Clazz;
import java.util.List;
import org.apache.ibatis.annotations.Select;

public interface ClazzMapper extends BaseMapper<Clazz> {

    @Select("SELECT c.*, t.real_name AS head_teacher_name, " +
            " (SELECT COUNT(*) FROM student s WHERE s.class_id = c.id) AS student_count " +
            "FROM class c LEFT JOIN teacher t ON c.head_teacher_id = t.id ORDER BY c.grade, c.name")
    List<Clazz> selectAllWithInfo();
}
