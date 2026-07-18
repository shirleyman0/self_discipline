// ===== 霓虹粒子场：漂浮辉光粒子 + 跟随光标的星座连线 =====
// 画布由 Vue 用 v-if 挂在 .scene 内（class="neon-fx"），首页轨道视角才存在。
// 本模块用自愈式 rAF 循环：每帧确认画布还在，不在就暂停、回来再绑定，
// 因此降落到地表（画布被移除）时自动停摆，升空回来再续上，无需 app.js 介入。
(function () {
    'use strict';

    const PALETTE = [
        [95, 235, 255],   // 青
        [96, 165, 250],   // 电蓝
        [167, 139, 250],  // 紫
        [244, 114, 182],  // 品红
        [125, 249, 210],  // 薄荷
        [255, 209, 102]   // 少量暖金点缀
    ];

    const prefersReduced = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 预渲染每种颜色的辉光贴图：drawImage 复用比每帧 createRadialGradient 快得多。
    function makeGlow(rgb) {
        const s = 64, c = document.createElement('canvas');
        c.width = c.height = s;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        const [r, gr, b] = rgb;
        grad.addColorStop(0, `rgba(${r},${gr},${b},1)`);
        grad.addColorStop(.25, `rgba(${r},${gr},${b},.55)`);
        grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
        g.fillStyle = grad;
        g.fillRect(0, 0, s, s);
        return c;
    }
    const GLOWS = PALETTE.map(makeGlow);

    let canvas = null, ctx = null, w = 0, h = 0, dpr = 1;
    let particles = [], stars = [];
    let mouse = { x: -1e4, y: -1e4, active: false };
    let t = 0, rafId = 0, bound = false;

    function seed() {
        // 数量随视口面积缩放，手机上更省。
        const area = w * h;
        const count = Math.max(46, Math.min(120, Math.round(area / 20000)));
        particles = [];
        for (let i = 0; i < count; i++) {
            const ci = Math.random() < .12 ? 5 : Math.floor(Math.random() * 5); // 暖金稀有
            particles.push({
                x: Math.random() * w,
                y: Math.random() * h,
                vx: (Math.random() - .5) * .35,
                vy: (Math.random() - .5) * .35,
                r: 1.1 + Math.random() * 2.6,
                ci,
                ph: Math.random() * Math.PI * 2,        // 闪烁相位
                tw: .6 + Math.random() * 1.4            // 闪烁速度
            });
        }
        // 远景微星：静态感的深空底噪，让画面更"满"。
        const sc = Math.round(area / 6000);
        stars = [];
        for (let i = 0; i < sc; i++) {
            stars.push({
                x: Math.random() * w,
                y: Math.random() * h,
                r: Math.random() < .85 ? .6 : 1.2,
                a: .1 + Math.random() * .5,
                ph: Math.random() * Math.PI * 2
            });
        }
    }

    function resize() {
        if (!canvas) return;
        dpr = Math.min(1.75, window.devicePixelRatio || 1);
        w = canvas.clientWidth || window.innerWidth;
        h = canvas.clientHeight || window.innerHeight;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        seed();
    }

    function bind(el) {
        canvas = el;
        ctx = canvas.getContext('2d');
        resize();
        bound = true;
        if (prefersReduced) { drawStatic(); }  // 减少动态：画一帧静态霓虹场即可
    }

    function unbind() {
        canvas = null; ctx = null; bound = false;
    }

    function drawStatic() {
        if (!ctx) return;
        ctx.clearRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';
        for (const s of stars) {
            ctx.globalAlpha = s.a;
            ctx.fillStyle = '#cfe6ff';
            ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
        }
        for (const p of particles) {
            const sz = p.r * 9;
            ctx.globalAlpha = .8;
            ctx.drawImage(GLOWS[p.ci], p.x - sz / 2, p.y - sz / 2, sz, sz);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }

    function frame() {
        rafId = requestAnimationFrame(frame);

        // 自愈：画布可能被 Vue 换进换出（降落/升空）。
        const live = document.querySelector('.neon-fx');
        if (!live) { if (bound) unbind(); return; }
        if (live !== canvas) bind(live);
        if (!ctx || prefersReduced) return;

        t += .016;
        ctx.clearRect(0, 0, w, h);

        // 远景微星：轻微呼吸闪烁。
        ctx.globalCompositeOperation = 'lighter';
        for (const s of stars) {
            ctx.globalAlpha = s.a * (.6 + .4 * Math.sin(t * 1.5 + s.ph));
            ctx.fillStyle = '#cfe6ff';
            ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
        }

        // 主粒子：漂移 + 缓慢涡旋 + 光标吸引。
        for (const p of particles) {
            p.x += p.vx + Math.sin(t * .3 + p.ph) * .12;
            p.y += p.vy + Math.cos(t * .26 + p.ph) * .12;

            if (mouse.active) {
                const dx = mouse.x - p.x, dy = mouse.y - p.y;
                const d2 = dx * dx + dy * dy;
                if (d2 < 200 * 200) {
                    const f = (1 - Math.sqrt(d2) / 200) * .35;
                    p.vx += (dx / (Math.sqrt(d2) + .01)) * f;
                    p.vy += (dy / (Math.sqrt(d2) + .01)) * f;
                }
            }
            // 阻尼 + 限速，避免越吸越快。
            p.vx *= .96; p.vy *= .96;
            const sp = Math.hypot(p.vx, p.vy);
            if (sp > .7) { p.vx = p.vx / sp * .7; p.vy = p.vy / sp * .7; }
            p.vx += (Math.random() - .5) * .02;
            p.vy += (Math.random() - .5) * .02;

            // 环绕出界。
            if (p.x < -20) p.x = w + 20; else if (p.x > w + 20) p.x = -20;
            if (p.y < -20) p.y = h + 20; else if (p.y > h + 20) p.y = -20;

            const tw = .55 + .45 * Math.sin(t * p.tw + p.ph);
            const sz = p.r * 9;
            ctx.globalAlpha = tw;
            ctx.drawImage(GLOWS[p.ci], p.x - sz / 2, p.y - sz / 2, sz, sz);
        }

        // 星座连线：只在光标附近连，既炫又省。
        if (mouse.active) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.lineWidth = 1;
            for (let i = 0; i < particles.length; i++) {
                const a = particles[i];
                const mdx = a.x - mouse.x, mdy = a.y - mouse.y;
                if (mdx * mdx + mdy * mdy > 220 * 220) continue;
                // 粒子↔光标
                const md = Math.hypot(mdx, mdy);
                ctx.strokeStyle = `rgba(120,220,255,${(1 - md / 220) * .45})`;
                ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
                // 粒子↔邻近粒子
                for (let j = i + 1; j < particles.length; j++) {
                    const b = particles[j];
                    const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
                    if (d2 < 120 * 120) {
                        ctx.strokeStyle = `rgba(150,200,255,${(1 - Math.sqrt(d2) / 120) * .22})`;
                        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
                    }
                }
            }
            // 光标光晕
            const hs = 150;
            ctx.globalAlpha = .5;
            ctx.drawImage(GLOWS[0], mouse.x - hs / 2, mouse.y - hs / 2, hs, hs);
        }

        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }

    function onMove(e) {
        mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true;
    }
    function onLeave() { mouse.active = false; }

    function boot() {
        window.addEventListener('pointermove', onMove, { passive: true });
        window.addEventListener('pointerdown', onMove, { passive: true });
        document.addEventListener('mouseleave', onLeave);
        window.addEventListener('resize', () => { if (canvas) resize(); });
        // 页面隐藏时停循环省电，回来再续。
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) { cancelAnimationFrame(rafId); rafId = 0; }
            else if (!rafId) frame();
        });
        frame();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
