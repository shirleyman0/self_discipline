package com.mike.discipline.service;

import com.mike.discipline.exception.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class EmailVerificationServiceTest {
    private VerificationEmailSender emailSender;
    private EmailVerificationService service;

    @BeforeEach
    void setUp() {
        emailSender = mock(VerificationEmailSender.class);
        service = new EmailVerificationService(emailSender);
    }

    @Test
    void sentCodeCanOnlyBeUsedOnceAndEmailIsNormalized() {
        service.sendCode("  USER@Example.COM ");

        ArgumentCaptor<String> codeCaptor = ArgumentCaptor.forClass(String.class);
        verify(emailSender).sendVerificationCode(org.mockito.ArgumentMatchers.eq("user@example.com"),
                codeCaptor.capture());
        String code = codeCaptor.getValue();
        assertEquals(6, code.length());

        service.verifyAndConsume("USER@example.com", code);
        assertThrows(ApiException.class, () -> service.verifyAndConsume("user@example.com", code));
    }

    @Test
    void fiveWrongAttemptsInvalidateTheCode() {
        service.sendCode("user@example.com");
        ArgumentCaptor<String> codeCaptor = ArgumentCaptor.forClass(String.class);
        verify(emailSender).sendVerificationCode(org.mockito.ArgumentMatchers.eq("user@example.com"),
                codeCaptor.capture());
        String code = codeCaptor.getValue();
        String wrongCode = code.equals("000000") ? "111111" : "000000";

        for (int i = 0; i < 5; i++) {
            assertThrows(ApiException.class, () -> service.verifyAndConsume("user@example.com", wrongCode));
        }
        assertThrows(ApiException.class, () -> service.verifyAndConsume("user@example.com", code));
    }

    @Test
    void repeatedSendWithinOneMinuteIsRejected() {
        service.sendCode("user@example.com");
        assertThrows(ApiException.class, () -> service.sendCode("USER@example.com"));
    }

}
