package com.mike.discipline.repository;

import com.mike.discipline.entity.Habit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface HabitRepository extends JpaRepository<Habit, Long> {

    List<Habit> findByUserIdAndArchivedFalseOrderByCreatedAtAsc(Long userId);

    /** 含已归档：建筑成长统计要算历史总量 */
    List<Habit> findByUserId(Long userId);
}
