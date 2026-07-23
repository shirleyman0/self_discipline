package com.mike.discipline.service;

import com.mike.discipline.exception.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.util.List;
import java.util.Map;

/** 使用 Resend HTTP API 发送邮件，不需要配置邮箱 SMTP 密码。 */
@Service
public class ResendEmailSender implements VerificationEmailSender {
    private static final Logger log = LoggerFactory.getLogger(ResendEmailSender.class);

    private final RestClient restClient;
    private final String apiKey;
    private final String from;

    public ResendEmailSender(RestClient.Builder builder,
                             @Value("${app.resend.api-key:}") String apiKey,
                             @Value("${app.mail.from:}") String from,
                             @Value("${app.resend.base-url:https://api.resend.com}") String baseUrl) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(5_000);
        requestFactory.setReadTimeout(8_000);
        this.restClient = builder.baseUrl(baseUrl).requestFactory(requestFactory).build();
        this.apiKey = apiKey.trim();
        this.from = from.trim();
    }

    @Override
    public void sendVerificationCode(String recipient, String code) {
        if (apiKey.isBlank()) {
            throw ApiException.badRequest("邮件服务未配置，请先设置 RESEND_API_KEY");
        }
        if (from.isBlank()) {
            throw ApiException.badRequest("邮件服务未配置，请先设置 MAIL_FROM");
        }

        Map<String, Object> body = Map.of(
                "from", from,
                "to", List.of(recipient),
                "subject", "自律星球注册验证码",
                "text", "你的自律星球注册验证码是：" + code
                        + "\n验证码 10 分钟内有效，请勿将验证码告诉他人。");

        try {
            restClient.post()
                    .uri("/emails")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                    .body(body)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientResponseException ex) {
            log.error("Resend 发送失败，状态码：{}，响应：{}", ex.getStatusCode(), ex.getResponseBodyAsString());
            if (ex.getStatusCode().value() == 401 || ex.getStatusCode().value() == 403) {
                throw ApiException.badRequest("RESEND_API_KEY 无效或没有发信权限");
            }
            if (ex.getStatusCode().value() == 422) {
                throw ApiException.badRequest("Resend 拒绝发信，请检查 MAIL_FROM 是否为已验证的发件地址");
            }
            throw ApiException.badRequest("验证码邮件发送失败，请稍后重试");
        } catch (RestClientException ex) {
            log.error("连接 Resend API 失败", ex);
            throw ApiException.badRequest("无法连接 Resend 邮件服务，请稍后重试");
        }
    }
}
