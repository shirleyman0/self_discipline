package com.mike.discipline.repository;

import com.mike.discipline.entity.Task;
import com.mike.discipline.entity.TaskStatus;
import com.mike.discipline.entity.TaskType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface TaskRepository extends JpaRepository<Task, Long> {

    List<Task> findByUserIdOrderByCreatedAtDesc(Long userId);

    List<Task> findByTypeAndStatus(TaskType type, TaskStatus status);

    List<Task> findByTypeAndStatusAndDueDateBefore(TaskType type, TaskStatus status, LocalDate date);

    long countByUserIdAndStatus(Long userId, TaskStatus status);
}
