package com.mike.discipline.controller;

import com.mike.discipline.config.CurrentUser;
import com.mike.discipline.entity.Review;
import com.mike.discipline.repository.ReviewRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/reviews")
public class ReviewController {

    private final ReviewRepository reviewRepository;

    public ReviewController(ReviewRepository reviewRepository) {
        this.reviewRepository = reviewRepository;
    }

    public record ReviewRequest(LocalDate date, @NotBlank String content) {
    }

    @GetMapping
    public List<Review> list() {
        return reviewRepository.findTop30ByUserIdOrderByReviewDateDesc(CurrentUser.id());
    }

    /** 一天一篇，重复提交覆盖当天内容 */
    @PostMapping
    public Review save(@RequestBody @Valid ReviewRequest req) {
        Long userId = CurrentUser.id();
        LocalDate date = req.date() == null ? LocalDate.now() : req.date();
        Review review = reviewRepository.findByUserIdAndReviewDate(userId, date)
                .orElseGet(() -> {
                    Review r = new Review();
                    r.setUserId(userId);
                    r.setReviewDate(date);
                    return r;
                });
        review.setContent(req.content());
        review.setUpdatedAt(LocalDateTime.now());
        return reviewRepository.save(review);
    }
}
