package com.mike.discipline.service;

/** 注册验证码的邮件发送通道。 */
public interface VerificationEmailSender {
    void sendVerificationCode(String recipient, String code);
}
