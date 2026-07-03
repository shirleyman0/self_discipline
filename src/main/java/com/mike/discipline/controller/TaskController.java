package com.mike.discipline.controller;

import com.mike.discipline.config.CurrentUser;
import com.mike.discipline.entity.Task;
import com.mike.discipline.entity.TaskType;
import com.mike.discipline.service.TaskService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {

    private final TaskService taskService;

    public TaskController(TaskService taskService) {
        this.taskService = taskService;
    }

    public record TaskRequest(
            @NotBlank @Size(max = 200) String title,
            TaskType type,
            LocalDate dueDate,
            Integer points) {
    }

    @GetMapping
    public List<Task> list() {
        return taskService.list(CurrentUser.id());
    }

    @GetMapping("/today")
    public List<Task> today() {
        return taskService.today(CurrentUser.id());
    }

    @PostMapping
    public Task create(@RequestBody @Valid TaskRequest req) {
        return taskService.create(CurrentUser.id(), req.title(), req.type(), req.dueDate(), req.points());
    }

    @PutMapping("/{id}")
    public Task update(@PathVariable Long id, @RequestBody TaskRequest req) {
        return taskService.update(CurrentUser.id(), id, req.title(), req.dueDate(), req.points());
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        taskService.delete(CurrentUser.id(), id);
    }

    @PostMapping("/{id}/complete")
    public Task complete(@PathVariable Long id) {
        return taskService.complete(CurrentUser.id(), id);
    }
}
