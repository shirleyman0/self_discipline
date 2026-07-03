package com.mike.discipline.controller;

import com.mike.discipline.config.CurrentUser;
import com.mike.discipline.entity.Habit;
import com.mike.discipline.service.HabitService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.*;

import java.time.Year;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/habits")
public class HabitController {

    private final HabitService habitService;

    public HabitController(HabitService habitService) {
        this.habitService = habitService;
    }

    public record HabitRequest(@NotBlank @Size(max = 100) String name, String icon, String color) {
    }

    public record CheckinRequest(String note) {
    }

    @GetMapping
    public List<Map<String, Object>> list() {
        return habitService.list(CurrentUser.id());
    }

    @PostMapping
    public Habit create(@RequestBody @Valid HabitRequest req) {
        return habitService.create(CurrentUser.id(), req.name(), req.icon(), req.color());
    }

    @PutMapping("/{id}")
    public Habit update(@PathVariable Long id, @RequestBody HabitRequest req) {
        return habitService.update(CurrentUser.id(), id, req.name(), req.icon(), req.color());
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        habitService.archive(CurrentUser.id(), id);
    }

    @PostMapping("/{id}/checkin")
    public Map<String, Object> checkin(@PathVariable Long id,
                                       @RequestBody(required = false) CheckinRequest req) {
        return habitService.checkin(CurrentUser.id(), id, req == null ? null : req.note());
    }

    @GetMapping("/{id}/heatmap")
    public List<List<Object>> heatmap(@PathVariable Long id,
                                      @RequestParam(required = false) Integer year) {
        int y = year == null ? Year.now().getValue() : year;
        return habitService.heatmap(CurrentUser.id(), id, y);
    }
}
