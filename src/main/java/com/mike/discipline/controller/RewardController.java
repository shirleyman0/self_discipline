package com.mike.discipline.controller;

import com.mike.discipline.config.CurrentUser;
import com.mike.discipline.entity.RewardItem;
import com.mike.discipline.exception.ApiException;
import com.mike.discipline.repository.RewardItemRepository;
import com.mike.discipline.service.GamificationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** 奖励商店：自定义奖励，用积分兑换 */
@RestController
@RequestMapping("/api/rewards")
public class RewardController {

    private final RewardItemRepository rewardRepository;
    private final GamificationService gamificationService;

    public RewardController(RewardItemRepository rewardRepository,
                            GamificationService gamificationService) {
        this.rewardRepository = rewardRepository;
        this.gamificationService = gamificationService;
    }

    public record RewardRequest(
            @NotBlank @Size(max = 100) String name,
            String icon,
            @Min(1) @Max(100000) int cost) {
    }

    @GetMapping
    public List<RewardItem> list() {
        return rewardRepository.findByUserIdOrderByCostAsc(CurrentUser.id());
    }

    @PostMapping
    public RewardItem create(@RequestBody @Valid RewardRequest req) {
        RewardItem item = new RewardItem();
        item.setUserId(CurrentUser.id());
        item.setName(req.name());
        item.setIcon(req.icon() == null || req.icon().isBlank() ? "🎁" : req.icon());
        item.setCost(req.cost());
        return rewardRepository.save(item);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        rewardRepository.delete(owned(id));
    }

    /** 兑换：扣积分（余额不足返回 400），返回新余额 */
    @PostMapping("/{id}/redeem")
    public Map<String, Object> redeem(@PathVariable Long id) {
        RewardItem item = owned(id);
        long balance = gamificationService.redeem(CurrentUser.id(), item.getCost(),
                "兑换奖励：" + item.getName());
        return Map.of("balance", balance);
    }

    private RewardItem owned(Long id) {
        RewardItem item = rewardRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("奖励不存在"));
        if (!item.getUserId().equals(CurrentUser.id())) {
            throw ApiException.notFound("奖励不存在");
        }
        return item;
    }
}
