package com.mike.discipline.controller;

import com.mike.discipline.config.CurrentUser;
import com.mike.discipline.service.PartnerService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/partner")
public class PartnerController {

    private final PartnerService partnerService;

    public PartnerController(PartnerService partnerService) {
        this.partnerService = partnerService;
    }

    public record BindRequest(@NotBlank @Size(min = 6, max = 10) String code) {
    }

    public record NudgeRequest(@NotBlank String type, @Size(max = 200) String message) {
    }

    @GetMapping
    public Map<String, Object> overview() {
        return partnerService.overview(CurrentUser.id());
    }

    @PostMapping("/bind")
    public Map<String, Object> bind(@RequestBody @Valid BindRequest req) {
        return partnerService.bind(CurrentUser.id(), req.code());
    }

    @DeleteMapping
    public void unbind() {
        partnerService.unbind(CurrentUser.id());
    }

    @PostMapping("/nudge")
    public void nudge(@RequestBody @Valid NudgeRequest req) {
        partnerService.nudge(CurrentUser.id(), req.type(), req.message());
    }

    @GetMapping("/feed")
    public List<Map<String, Object>> feed() {
        return partnerService.feed(CurrentUser.id());
    }

    @GetMapping("/compare")
    public Map<String, Object> compare(@RequestParam(defaultValue = "week") String range) {
        return partnerService.compare(CurrentUser.id(), range);
    }
}
