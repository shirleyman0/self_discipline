package com.mike.discipline;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class DisciplineApplication {

    public static void main(String[] args) {
        SpringApplication.run(DisciplineApplication.class, args);
    }
}
