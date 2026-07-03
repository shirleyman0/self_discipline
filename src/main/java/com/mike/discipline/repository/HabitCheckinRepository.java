package com.mike.discipline.repository;

import com.mike.discipline.entity.HabitCheckin;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface HabitCheckinRepository extends JpaRepository<HabitCheckin, Long> {

    boolean existsByHabitIdAndCheckinDate(Long habitId, LocalDate date);

    List<HabitCheckin> findByHabitIdOrderByCheckinDateDesc(Long habitId);

    List<HabitCheckin> findByHabitIdAndCheckinDateBetween(Long habitId, LocalDate start, LocalDate end);

    List<HabitCheckin> findByUserIdAndCheckinDate(Long userId, LocalDate date);

    List<HabitCheckin> findByUserIdAndCheckinDateBetween(Long userId, LocalDate start, LocalDate end);

    List<HabitCheckin> findByUserId(Long userId);

    long countByUserId(Long userId);
}
