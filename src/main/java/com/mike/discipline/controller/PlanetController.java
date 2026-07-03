package com.mike.discipline.controller;

import com.mike.discipline.config.CurrentUser;
import com.mike.discipline.service.PlanetService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/planet")
public class PlanetController {

    private final PlanetService planetService;

    public PlanetController(PlanetService planetService) {
        this.planetService = planetService;
    }

    public record RenameRequest(@NotBlank @Size(max = 30) String name) {
    }

    public record MessageRequest(@NotBlank @Size(max = 200) String content,
                                 @Size(max = 10) String gift) {
    }

    /** 我的星球场景数据 */
    @GetMapping
    public Map<String, Object> myPlanet() {
        return planetService.myPlanet(CurrentUser.id());
    }

    /** 访问搭档的星球 */
    @GetMapping("/partner")
    public Map<String, Object> partnerPlanet() {
        return planetService.partnerPlanet(CurrentUser.id());
    }

    @PutMapping("/name")
    public void rename(@RequestBody @Valid RenameRequest req) {
        planetService.rename(CurrentUser.id(), req.name());
    }

    /** 在搭档星球留言 */
    @PostMapping("/partner/message")
    public void leaveMessage(@RequestBody @Valid MessageRequest req) {
        planetService.leaveMessage(CurrentUser.id(), req.content(), req.gift());
    }
}
