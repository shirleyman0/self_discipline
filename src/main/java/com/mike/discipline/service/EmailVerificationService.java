package com.mike.discipline.service;

import com.mike.discipline.exception.ApiException;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;

/** 负责发送并校验注册邮箱验证码。验证码只保存在内存中，过期或使用后立即失效。 */
@Service
public class EmailVerificationService {
    private static final Duration CODE_TTL = Duration.ofMinutes(10);
    private static final Duration SEND_INTERVAL = Duration.ofSeconds(60);
    private static final int MAX_ATTEMPTS = 5;
    private static final String CODE_CHARS = "0123456789";

    private final VerificationEmailSender emailSender;
    private final SecureRandom random = new SecureRandom();
    private final ConcurrentHashMap<String, CodeEntry> codes = new ConcurrentHashMap<>();

    public EmailVerificationService(VerificationEmailSender emailSender) {
        this.emailSender = emailSender;
    }

    public void sendCode(String rawEmail) {
        String email = normalize(rawEmail);
        Instant now = Instant.now();
        CodeEntry existing = codes.get(email);
        if (existing != null && now.isBefore(existing.nextSendAt())) {
            long seconds = Math.max(1, Duration.between(now, existing.nextSendAt()).toSeconds());
            throw ApiException.badRequest("请 " + seconds + " 秒后再获取验证码");
        }

        String code = sixDigitCode();
        emailSender.sendVerificationCode(email, code);
        codes.put(email, new CodeEntry(code, now.plus(CODE_TTL), now.plus(SEND_INTERVAL), 0));
    }

    public synchronized void verifyAndConsume(String rawEmail, String inputCode) {
        String email = normalize(rawEmail);
        CodeEntry entry = codes.get(email);
        if (entry == null || Instant.now().isAfter(entry.expiresAt())) {
            codes.remove(email);
            throw ApiException.badRequest("验证码不存在或已过期，请重新获取");
        }
        if (inputCode == null || !entry.code().equals(inputCode.trim())) {
            int attempts = entry.attempts() + 1;
            if (attempts >= MAX_ATTEMPTS) codes.remove(email);
            else codes.put(email, new CodeEntry(entry.code(), entry.expiresAt(), entry.nextSendAt(), attempts));
            throw ApiException.badRequest(attempts >= MAX_ATTEMPTS ? "验证码错误次数过多，请重新获取" : "验证码错误");
        }
        codes.remove(email, entry);
    }

    private String sixDigitCode() {
        StringBuilder code = new StringBuilder(6);
        for (int i = 0; i < 6; i++) code.append(CODE_CHARS.charAt(random.nextInt(CODE_CHARS.length())));
        return code.toString();
    }

    private String normalize(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    private record CodeEntry(String code, Instant expiresAt, Instant nextSendAt, int attempts) {}
}
