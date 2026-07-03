package com.mike.discipline.service;

import com.mike.discipline.config.JwtUtil;
import com.mike.discipline.entity.User;
import com.mike.discipline.exception.ApiException;
import com.mike.discipline.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtUtil jwtUtil) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
    }

    @Transactional
    public Map<String, Object> register(String username, String password, String nickname) {
        if (userRepository.existsByUsername(username)) {
            throw ApiException.conflict("用户名已存在");
        }
        User user = new User();
        user.setUsername(username);
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setNickname(nickname == null || nickname.isBlank() ? username : nickname);
        userRepository.save(user);
        return tokenResponse(user);
    }

    public Map<String, Object> login(String username, String password) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> ApiException.badRequest("用户名或密码错误"));
        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            throw ApiException.badRequest("用户名或密码错误");
        }
        return tokenResponse(user);
    }

    private Map<String, Object> tokenResponse(User user) {
        return Map.of(
                "token", jwtUtil.generate(user.getId(), user.getUsername()),
                "user", Map.of(
                        "id", user.getId(),
                        "username", user.getUsername(),
                        "nickname", user.getNickname()));
    }
}
