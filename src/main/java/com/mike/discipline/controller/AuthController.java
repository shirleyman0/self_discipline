package com.mike.discipline.controller;

import com.mike.discipline.service.AuthService;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    public record RegisterRequest(
            @NotBlank @Size(min = 3, max = 50) String username,
            @NotBlank @Size(min = 6, max = 100) String password,
            @NotBlank(message = "请输入邮箱") @Email(message = "邮箱格式不正确") @Size(max = 254) String email,
            @NotBlank(message = "请输入邮箱验证码")
            @Pattern(regexp = "\\d{6}", message = "邮箱验证码必须是 6 位数字") String verificationCode,
            String nickname) {
    }

    public record SendCodeRequest(
            @NotBlank(message = "请输入邮箱") @Email(message = "邮箱格式不正确") @Size(max = 254) String email) {
    }

    public record LoginRequest(@NotBlank String username, @NotBlank String password) {
    }

    @PostMapping("/register")
    public Map<String, Object> register(@RequestBody @jakarta.validation.Valid RegisterRequest req) {
        return authService.register(req.username(), req.password(), req.email(), req.verificationCode(), req.nickname());
    }

    @PostMapping("/send-code")
    public Map<String, String> sendCode(@RequestBody @jakarta.validation.Valid SendCodeRequest req) {
        authService.sendVerificationCode(req.email());
        return Map.of("message", "验证码已发送，请查收邮件");
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody @jakarta.validation.Valid LoginRequest req) {
        return authService.login(req.username(), req.password());
    }
}
