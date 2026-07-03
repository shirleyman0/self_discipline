package com.mike.discipline.controller;

import com.mike.discipline.config.CurrentUser;
import com.mike.discipline.entity.FocusSession;
import com.mike.discipline.service.FocusService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/focus")
public class FocusController {

    private final FocusService focusService;

    public FocusController(FocusService focusService) {
        this.focusService = focusService;
    }

    public record FocusRequest(
            Long taskId,
            @Min(1) @Max(480) int durationMinutes,
            String note) {
    }

    @PostMapping
    public FocusSession record(@RequestBody @Valid FocusRequest req) {
        return focusService.record(CurrentUser.id(), req.taskId(), req.durationMinutes(), req.note());
    }

    @GetMapping("/today")
    public Map<String, Object> today() {
        return focusService.todayStats(CurrentUser.id());
    }
}
