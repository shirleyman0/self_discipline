package com.mike.discipline.service;

import com.mike.discipline.entity.Achievement;
import com.mike.discipline.entity.Task;
import com.mike.discipline.entity.TaskStatus;
import com.mike.discipline.entity.TaskType;
import com.mike.discipline.exception.ApiException;
import com.mike.discipline.repository.TaskRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Service
public class TaskService {

    private final TaskRepository taskRepository;
    private final GamificationService gamificationService;

    public TaskService(TaskRepository taskRepository, GamificationService gamificationService) {
        this.taskRepository = taskRepository;
        this.gamificationService = gamificationService;
    }

    public List<Task> list(Long userId) {
        return taskRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    /** 今日任务：所有 DAILY/WEEKLY + 今天到期或已过期未完成的 ONCE + 今天完成的 ONCE */
    public List<Task> today(Long userId) {
        LocalDate today = LocalDate.now();
        return taskRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .filter(t -> switch (t.getType()) {
                    case DAILY, WEEKLY -> true;
                    case ONCE -> isOnceRelevantToday(t, today);
                })
                .toList();
    }

    private boolean isOnceRelevantToday(Task t, LocalDate today) {
        boolean dueNowOrOverdue = t.getStatus() == TaskStatus.PENDING
                && (t.getDueDate() == null || !t.getDueDate().isAfter(today));
        boolean doneToday = t.getStatus() == TaskStatus.DONE
                && t.getCompletedAt() != null
                && t.getCompletedAt().toLocalDate().equals(today);
        return dueNowOrOverdue || doneToday;
    }

    @Transactional
    public Task create(Long userId, String title, TaskType type, LocalDate dueDate, Integer points) {
        Task task = new Task();
        task.setUserId(userId);
        task.setTitle(title);
        task.setType(type == null ? TaskType.ONCE : type);
        task.setDueDate(dueDate);
        task.setPoints(points == null || points <= 0 ? 20 : points);
        return taskRepository.save(task);
    }

    @Transactional
    public Task update(Long userId, Long taskId, String title, LocalDate dueDate, Integer points) {
        Task task = owned(userId, taskId);
        if (title != null && !title.isBlank()) {
            task.setTitle(title);
        }
        if (dueDate != null) {
            task.setDueDate(dueDate);
        }
        if (points != null && points > 0) {
            task.setPoints(points);
        }
        return taskRepository.save(task);
    }

    @Transactional
    public void delete(Long userId, Long taskId) {
        taskRepository.delete(owned(userId, taskId));
    }

    @Transactional
    public Task complete(Long userId, Long taskId) {
        Task task = owned(userId, taskId);
        if (task.getStatus() == TaskStatus.DONE) {
            throw ApiException.conflict("任务已完成");
        }
        task.setStatus(TaskStatus.DONE);
        task.setCompletedAt(LocalDateTime.now());
        taskRepository.save(task);

        gamificationService.reward(userId, task.getPoints(), task.getPoints(),
                "完成任务：" + task.getTitle());

        long doneCount = taskRepository.countByUserIdAndStatus(userId, TaskStatus.DONE);
        if (doneCount >= 10) {
            gamificationService.unlock(userId, Achievement.TASKS_10);
        }
        if (doneCount >= 100) {
            gamificationService.unlock(userId, Achievement.TASKS_100);
        }
        return task;
    }

    private Task owned(Long userId, Long taskId) {
        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> ApiException.notFound("任务不存在"));
        if (!task.getUserId().equals(userId)) {
            throw ApiException.notFound("任务不存在");
        }
        return task;
    }
}
