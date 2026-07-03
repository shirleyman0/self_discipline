package com.mike.discipline.service;

import com.mike.discipline.entity.Task;
import com.mike.discipline.entity.TaskStatus;
import com.mike.discipline.entity.TaskType;
import com.mike.discipline.repository.TaskRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;

/**
 * 每日结算（惩罚机制核心）：每天 00:05 执行。
 * - DAILY：昨天没完成 → 扣分记失败流水，然后重置为 PENDING 供今天使用；已完成 → 直接重置。
 * - WEEKLY：每周一结算上一周，规则同上。
 * - ONCE：截止日期已过仍未完成 → 标记 FAILED 并扣分（保留失败状态）。
 * 失败历史通过 point_log 的负分流水保留。
 */
@Component
public class DailySettlementJob {

    private static final Logger log = LoggerFactory.getLogger(DailySettlementJob.class);

    private final TaskRepository taskRepository;
    private final GamificationService gamificationService;

    public DailySettlementJob(TaskRepository taskRepository,
                              GamificationService gamificationService) {
        this.taskRepository = taskRepository;
        this.gamificationService = gamificationService;
    }

    @Scheduled(cron = "0 5 0 * * *", zone = "Asia/Shanghai")
    @Transactional
    public void settle() {
        LocalDate today = LocalDate.now();
        LocalDate yesterday = today.minusDays(1);
        log.info("开始每日结算：{}", today);

        // DAILY：结算昨天并重置
        settleAndReset(taskRepository.findByTypeAndStatus(TaskType.DAILY, TaskStatus.PENDING),
                "每日任务未完成", yesterday.toString());
        resetDone(TaskType.DAILY);

        // WEEKLY：只在周一结算上一周并重置
        if (today.getDayOfWeek() == DayOfWeek.MONDAY) {
            settleAndReset(taskRepository.findByTypeAndStatus(TaskType.WEEKLY, TaskStatus.PENDING),
                    "每周任务未完成", "截至 " + yesterday);
            resetDone(TaskType.WEEKLY);
        }

        // ONCE：过期未完成 → FAILED + 扣分
        List<Task> overdue = taskRepository.findByTypeAndStatusAndDueDateBefore(
                TaskType.ONCE, TaskStatus.PENDING, today);
        for (Task task : overdue) {
            task.setStatus(TaskStatus.FAILED);
            taskRepository.save(task);
            gamificationService.punish(task.getUserId(), task.getPoints(),
                    "任务逾期未完成：" + task.getTitle() + "（截止 " + task.getDueDate() + "）");
        }
        log.info("每日结算完成");
    }

    /** PENDING 的周期任务：扣分记流水，状态保持 PENDING 进入新周期 */
    private void settleAndReset(List<Task> pendingTasks, String reasonPrefix, String period) {
        for (Task task : pendingTasks) {
            gamificationService.punish(task.getUserId(), task.getPoints(),
                    reasonPrefix + "：" + task.getTitle() + "（" + period + "）");
        }
    }

    /** DONE 的周期任务重置为 PENDING，开始新周期 */
    private void resetDone(TaskType type) {
        for (Task task : taskRepository.findByTypeAndStatus(type, TaskStatus.DONE)) {
            task.setStatus(TaskStatus.PENDING);
            task.setCompletedAt(null);
            taskRepository.save(task);
        }
    }
}
