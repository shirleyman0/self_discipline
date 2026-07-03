package com.mike.discipline.controller;

import com.mike.discipline.service.DailySettlementJob;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** 开发辅助：手动触发每日结算，方便验证惩罚逻辑（需登录） */
@RestController
@RequestMapping("/api/dev")
public class DevController {

    private final DailySettlementJob settlementJob;

    public DevController(DailySettlementJob settlementJob) {
        this.settlementJob = settlementJob;
    }

    @PostMapping("/settle")
    public Map<String, String> settle() {
        settlementJob.settle();
        return Map.of("message", "结算完成");
    }
}
