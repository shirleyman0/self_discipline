package com.mike.discipline.controller;

import com.mike.discipline.config.CurrentUser;
import com.mike.discipline.service.PlanetService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
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

    public record ResidentNameRequest(@NotBlank @Size(max = 20) String name) {
    }

    public record MessageRequest(@NotBlank @Size(max = 200) String content,
                                 @Size(max = 10) String gift) {
    }

    public record DecorationRequest(
            @NotBlank @Size(max = 20) String code,
            @DecimalMin("0.0") @DecimalMax("100.0") double posX) {
    }

    public record WorldBuildRequest(
            @NotBlank @Size(max = 20) String kind,
            @NotNull Double x,
            @NotNull Double z) {
    }

    public record AvatarRequest(
            @NotBlank @Size(max = 20) String style,
            @NotBlank @Size(max = 7) String color,
            @NotBlank @Size(max = 7) String skinColor,
            @NotBlank @Size(max = 7) String hairColor) {
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

    @PutMapping("/resident/name")
    public void renameResident(@RequestBody @Valid ResidentNameRequest req) {
        planetService.renameResident(CurrentUser.id(), req.name());
    }

    /** 在搭档星球留言 */
    @PostMapping("/partner/message")
    public void leaveMessage(@RequestBody @Valid MessageRequest req) {
        planetService.leaveMessage(CurrentUser.id(), req.content(), req.gift());
    }

    /** 建造装饰（扣积分） */
    @PostMapping("/decorations")
    public PlanetDecorationResponse addDecoration(@RequestBody @Valid DecorationRequest req) {
        var saved = planetService.addDecoration(CurrentUser.id(), req.code(), req.posX());
        return new PlanetDecorationResponse(saved.getId(), saved.getCode().name(), saved.getCode().getTitle(),
                saved.getCode().getEmoji(), saved.getCode().isOrbit(), saved.getPosX());
    }

    /** 拆除装饰 */
    @DeleteMapping("/decorations/{id}")
    public void removeDecoration(@PathVariable Long id) {
        planetService.removeDecoration(CurrentUser.id(), id);
    }

    @PostMapping("/world/objects")
    public PlanetService.WorldObjectView build(@RequestBody @Valid WorldBuildRequest req) {
        return planetService.buildWorldObject(CurrentUser.id(), req.kind(), req.x(), req.z());
    }

    @DeleteMapping("/world/objects/{id}")
    public void removeWorldObject(@PathVariable Long id) {
        planetService.removeWorldObject(CurrentUser.id(), id);
    }

    /** 摆件升级（扣积分，外观逐级豪华） */
    @PostMapping("/world/objects/{id}/upgrade")
    public PlanetService.WorldObjectView upgradeWorldObject(@PathVariable Long id) {
        return planetService.upgradeWorldObject(CurrentUser.id(), id);
    }

    @PutMapping("/avatar")
    public void avatar(@RequestBody @Valid AvatarRequest req) {
        planetService.updateAvatar(CurrentUser.id(), req.style(), req.color(),
                req.skinColor(), req.hairColor());
    }

    public record PlanetDecorationResponse(Long id, String code, String title, String emoji,
                                           boolean orbit, double posX) {
    }
}
