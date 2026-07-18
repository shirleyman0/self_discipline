// ===== Planet3D：Three.js 实时 3D 星球渲染模块 =====
// 用法：const h = Planet3D.mount(el, { size, tier, onClick });
//       h.setTier(n) 切换进化阶段；h.destroy() 销毁。
(function () {
    'use strict';

    /* ---------- 噪声 ---------- */
    function hash3(x, y, z, seed) {
        const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 269.5) * 43758.5453;
        return n - Math.floor(n);
    }
    function vnoise3(x, y, z, seed) {
        const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
        const xf = x - xi, yf = y - yi, zf = z - zi;
        const s = t => t * t * (3 - 2 * t);
        const u = s(xf), v = s(yf), w = s(zf);
        let acc = 0;
        for (let dz = 0; dz <= 1; dz++) for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
            acc += hash3(xi + dx, yi + dy, zi + dz, seed) *
                (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
        }
        return acc;
    }
    function fbm3(x, y, z, seed) {
        return vnoise3(x, y, z, seed) * .5 + vnoise3(x * 2, y * 2, z * 2, seed + 5) * .28 +
               vnoise3(x * 4, y * 4, z * 4, seed + 9) * .14 + vnoise3(x * 8, y * 8, z * 8, seed + 13) * .08;
    }

    /* ---------- 各进化阶段配置 ----------
     * size：星球本体（含云层/大气/星环）的整体缩放，从星尘到恒星逐级长大。
     * dust：环绕粒子带。true=星尘默认样式；对象可自定义数量/颜色/半径，
     *       粒子带不随本体缩放——「核心越长越大、星云渐渐稀薄」的演化观感。 */
    const TIERS = {
        1: { // 星尘：灰蓝矮行星 + 环绕尘埃粒子（保持原样）
            bands: [[.5, '#6f7690'], [.6, '#8c94ad'], [.7, '#a5adc4'], [1, '#c2c9dd']],
            glow: 0xaab4d8, scale: 2.2, dust: true, atmoLoose: true, seed: 17, size: .72
        },
        2: { // 陨石：布满环形山的暖褐岩体，碎石带尚未散尽
            bands: [[.4, '#3d2f22'], [.5, '#5c4936'], [.6, '#7b6249'], [.72, '#997e5e'], [.85, '#b39a78'], [1, '#cdb896']],
            glow: 0xc9a98c, scale: 3.0, seed: 23, size: .80,
            craters: { count: 30 },
            dust: { count: 110, color: 0xb59a78, size: .055, opacity: .7, rMin: 2.0, rSpan: .9, ySpread: .45 }
        },
        3: { // 小行星：冷蓝冰岩 + 环形山 + 稀疏冰晶闪点
            bands: [[.42, '#232e4e'], [.52, '#35446f'], [.62, '#4d5d90'], [.74, '#6b7cb0'], [.86, '#8ea0cc'], [1, '#b9c6e4']],
            glow: 0x8fa3d0, scale: 2.8, seed: 31, size: .87,
            craters: { count: 20 },
            dust: { count: 60, color: 0xa8ccff, size: .045, opacity: .65, rMin: 2.1, rSpan: .8, ySpread: .3 }
        },
        4: { // 岩浆行星：黑色玄武岩壳 + 蛛网状炽热熔缝（自发光）
            bands: [[.46, '#1a0e08'], [.55, '#301710'], [.64, '#452015'], [.76, '#59291a'], [1, '#6f3520']],
            glow: 0xff8a50, scale: 3.1, lava: true, seed: 11, size: .93
        },
        5: { // 海洋行星：深海—浅海—沙滩—丛林的层次
            bands: [[.47, '#0a2f66'], [.54, '#0f4d9a'], [.60, '#1f74cf'], [.63, '#3ec2d8'], [.66, '#e8dcae'], [.76, '#3fae72'], [1, '#2c7d52']],
            glow: 0x6edcff, scale: 2.1, sea: .64, caps: true, clouds: true, spec: true, seed: 7, size: .98
        },
        6: { // 翠绿行星：葱茏大陆 + 冰蓝浅滩 + 星环
            bands: [[.42, '#0d3a67'], [.49, '#1c64b2'], [.545, '#2f8ad4'], [.575, '#46c8d4'], [.60, '#e6d9a8'], [.68, '#52cc84'], [.82, '#35a463'], [1, '#27824c']],
            glow: 0x7bed9f, scale: 2.1, sea: .58, caps: true, clouds: true, spec: true, ring: true, seed: 3, size: 1.02
        },
        7: { // 文明行星：星环 + 暗面万家灯火
            bands: [[.46, '#1b1450'], [.54, '#2c2178'], [.61, '#4234a3'], [.65, '#cdbcf2'], [.76, '#7a63cc'], [.88, '#9a84e2'], [1, '#b3a0f0']],
            glow: 0xa78bfa, scale: 2.1, sea: .61, clouds: true, spec: true, ring: true, lights: true, seed: 41, size: 1.06
        },
        8: { // 恒星：翻涌的米粒组织 + 太阳黑子 + 脉动日冕
            bands: [[.4, '#e06a10'], [.5, '#f59a22'], [.6, '#ffc04d'], [.72, '#ffe08a'], [1, '#fff7d6']],
            glow: 0xffd166, scale: 2.6, star: true, seed: 55, size: 1.10,
            craters: { count: 6, dark: true, k: 1.9 }
        }
    };

    /* 环形山 / 太阳黑子：在已生成的颜色贴图上盖印坑洞（左右各补画一份保证经度接缝连续） */
    function paintCraters(ctx, W, H, conf) {
        const C = conf.craters;
        for (let n = 0; n < C.count; n++) {
            const cx0 = hash3(n, 1, 7, conf.seed) * W;
            const cy = H * (.18 + .64 * hash3(n, 2, 7, conf.seed));
            const r = (3 + 13 * Math.pow(hash3(n, 3, 7, conf.seed), 2)) * (C.k || 1);
            for (const cx of [cx0 - W, cx0, cx0 + W]) {
                const g = ctx.createRadialGradient(cx - r * .2, cy - r * .2, r * .1, cx, cy, r);
                if (C.dark) { // 太阳黑子：只压暗，无亮缘
                    g.addColorStop(0, 'rgba(70,18,0,.78)');
                    g.addColorStop(.6, 'rgba(120,40,0,.35)');
                    g.addColorStop(1, 'rgba(0,0,0,0)');
                } else {      // 环形山：坑底阴影 + 坑缘高光
                    g.addColorStop(0, 'rgba(0,0,12,.42)');
                    g.addColorStop(.62, 'rgba(0,0,12,.16)');
                    g.addColorStop(.78, 'rgba(255,255,255,.30)');
                    g.addColorStop(1, 'rgba(255,255,255,0)');
                }
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
            }
        }
    }

    /* ---------- 纹理生成 ---------- */
    function genMaps(conf) {
        const W = 512, H = 256;
        const cMap = document.createElement('canvas'); cMap.width = W; cMap.height = H;
        const cSpec = document.createElement('canvas'); cSpec.width = W; cSpec.height = H;
        const cLights = conf.lights ? document.createElement('canvas') : null;
        if (cLights) { cLights.width = W; cLights.height = H; }
        const cVeins = conf.lava ? document.createElement('canvas') : null;
        if (cVeins) { cVeins.width = W; cVeins.height = H; }
        const mx = cMap.getContext('2d'), sx = cSpec.getContext('2d');
        const lx = cLights ? cLights.getContext('2d') : null;
        const ex = cVeins ? cVeins.getContext('2d') : null;
        const img = mx.createImageData(W, H), simg = sx.createImageData(W, H);
        const limg = lx ? lx.createImageData(W, H) : null;
        const eimg = ex ? ex.createImageData(W, H) : null;

        for (let py = 0; py < H; py++) {
            const lat = (py / H - .5) * Math.PI;
            for (let px = 0; px < W; px++) {
                const lon = px / W * Math.PI * 2;
                const nx = Math.cos(lat) * Math.cos(lon), ny = Math.sin(lat), nz = Math.cos(lat) * Math.sin(lon);
                const n = fbm3(nx * conf.scale + 9, ny * conf.scale + 9, nz * conf.scale + 9, conf.seed);
                let color = conf.bands[conf.bands.length - 1][1];
                for (const [t, col] of conf.bands) { if (n <= t) { color = col; break; } }
                let r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
                // 细节噪声防止大色块呆板；恒星加大振幅模拟米粒组织
                const d = (fbm3(nx * 7 + 30, ny * 7 + 30, nz * 7 + 30, conf.seed + 21) - .5) * (conf.star ? 58 : 34);
                r = Math.max(0, Math.min(255, r + d));
                g = Math.max(0, Math.min(255, g + d));
                b = Math.max(0, Math.min(255, b + d));
                // 极地冰盖
                if (conf.caps && Math.abs(ny) > .78) {
                    const t = Math.min(1, (Math.abs(ny) - .78) / .12);
                    r += (245 - r) * t; g += (250 - g) * t; b += (252 - b) * t;
                }
                // 岩浆熔缝：脊状噪声形成蛛网状裂隙，缝心白热、缝旁岩壳被热浪染亮
                let heat = 0;
                if (eimg) {
                    const rv = fbm3(nx * 3 + 80, ny * 3 + 80, nz * 3 + 80, conf.seed + 51);
                    heat = Math.max(0, ((1 - Math.abs(rv - .5) * 2) - .875) / .125);
                    if (heat > 0) { r = Math.min(255, r + 48 * heat); g = Math.min(255, g + 16 * heat); }
                }
                const i = (py * W + px) * 4;
                img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
                if (eimg) {
                    eimg.data[i] = Math.min(255, 300 * heat);
                    eimg.data[i + 1] = 165 * heat;
                    eimg.data[i + 2] = 50 * heat * heat;
                    eimg.data[i + 3] = 255;
                }
                // 海面高光
                const sv = (conf.spec && conf.sea && n < conf.sea) ? 200 : 15;
                simg.data[i] = sv; simg.data[i + 1] = sv; simg.data[i + 2] = sv; simg.data[i + 3] = 255;
                // 文明夜灯：陆地上的聚落光点
                if (limg) {
                    const isLand = conf.sea && n > conf.sea && Math.abs(ny) < .7;
                    const cluster = fbm3(nx * 5 + 60, ny * 5 + 60, nz * 5 + 60, conf.seed + 33);
                    const lit = isLand && cluster > .6 && hash3(px, py, 0, conf.seed) > .82;
                    const lv = lit ? 255 : 0;
                    limg.data[i] = lv; limg.data[i + 1] = lv * .82; limg.data[i + 2] = lv * .4; limg.data[i + 3] = 255;
                }
            }
        }
        mx.putImageData(img, 0, 0);
        if (conf.craters) paintCraters(mx, W, H, conf);
        sx.putImageData(simg, 0, 0);
        if (lx) lx.putImageData(limg, 0, 0);
        if (ex) ex.putImageData(eimg, 0, 0);
        return { map: cMap, spec: cSpec, lights: cLights, veins: cVeins };
    }

    function genClouds(seed) {
        const W = 512, H = 256;
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const cx = c.getContext('2d');
        const img = cx.createImageData(W, H);
        for (let py = 0; py < H; py++) {
            const lat = (py / H - .5) * Math.PI;
            for (let px = 0; px < W; px++) {
                const lon = px / W * Math.PI * 2;
                const nx = Math.cos(lat) * Math.cos(lon), ny = Math.sin(lat), nz = Math.cos(lat) * Math.sin(lon);
                const n = fbm3(nx * 3.4 + 50, ny * 3.4 + 50, nz * 3.4 + 50, seed + 77);
                const i = (py * W + px) * 4;
                img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255;
                img.data[i + 3] = Math.min(230, Math.max(0, (n - .58)) * 5.2 * 255);
            }
        }
        cx.putImageData(img, 0, 0);
        return c;
    }

    function ringTexture() {
        // 内缘 1.85 / 外缘 2.35 → 贴图内缘半径 ≈ 128 × (1.85/2.35) ≈ 100
        const c = document.createElement('canvas'); c.width = 256; c.height = 256;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(128, 128, 100, 128, 128, 128);
        grad.addColorStop(0, 'rgba(255,244,224,0)');
        grad.addColorStop(.10, 'rgba(255,238,200,.85)');
        grad.addColorStop(.24, 'rgba(210,225,255,.30)');
        grad.addColorStop(.38, 'rgba(255,250,235,.78)');
        grad.addColorStop(.50, 'rgba(140,160,210,.10)');   // 卡西尼缝
        grad.addColorStop(.62, 'rgba(235,242,255,.85)');
        grad.addColorStop(.78, 'rgba(190,214,255,.45)');
        grad.addColorStop(.92, 'rgba(255,246,228,.55)');
        grad.addColorStop(1, 'rgba(255,244,224,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 256, 256);
        return c;
    }

    function glowSprite(hex) {
        const c = document.createElement('canvas'); c.width = 256; c.height = 256;
        const g = c.getContext('2d');
        const col = '#' + hex.toString(16).padStart(6, '0');
        const grad = g.createRadialGradient(128, 128, 20, 128, 128, 128);
        grad.addColorStop(0, col + 'cc');
        grad.addColorStop(.35, col + '55');
        grad.addColorStop(.7, col + '00');
        grad.addColorStop(1, col + '00');
        g.fillStyle = grad;
        g.fillRect(0, 0, 256, 256);
        return c;
    }

    /* ---------- 场景构建 ---------- */
    function mount(el, opts) {
        const size = opts.size || 470;
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(size, size);
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        el.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
        // 相机后拉（5.4 → 7.35）：给星环、大气辉光和逐级长大的星球留出画布边距，星环不再被裁边。
        // 可视半高 ≈ 2.53；主页画布同步从 470 放大到 640，星球在屏幕上的像素尺寸保持不变。
        camera.position.set(0, 0, 7.35);

        scene.add(new THREE.AmbientLight(0x8890c0, .9));
        const sun = new THREE.DirectionalLight(0xffffff, 3.2);
        sun.position.set(-3.5, 2.4, 3.2);
        scene.add(sun);

        let group = null;        // 当前 tier 的所有对象
        let planetMesh = null, cloudMesh = null, dustPoints = null, coronaSprite = null;
        let destroyed = false;

        function clearGroup() {
            if (!group) return;
            scene.remove(group);
            group.traverse(o => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) {
                    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
                        if (m.map) m.map.dispose();
                        m.dispose();
                    });
                }
            });
            group = planetMesh = cloudMesh = dustPoints = coronaSprite = null;
        }

        function build(tier) {
            clearGroup();
            const conf = TIERS[tier] || TIERS[1];
            group = new THREE.Group();
            scene.add(group);
            // 星球本体（球体/云层/大气/星环/日冕）挂在 body 上，随进化阶段从小长大
            const body = new THREE.Group();
            body.scale.setScalar(conf.size || 1);
            group.add(body);

            const maps = genMaps(conf);
            const tex = new THREE.CanvasTexture(maps.map);
            tex.colorSpace = THREE.SRGBColorSpace;

            let mat;
            if (conf.star) {
                mat = new THREE.MeshBasicMaterial({ map: tex });
            } else {
                mat = new THREE.MeshPhongMaterial({
                    map: tex,
                    specularMap: new THREE.CanvasTexture(maps.spec),
                    specular: 0x99ccee, shininess: 18
                });
                if (conf.lava) {
                    mat.emissiveMap = new THREE.CanvasTexture(maps.veins);
                    mat.emissive = new THREE.Color(0xffffff);
                    mat.emissiveIntensity = 1.05;
                }
                if (conf.lights) {
                    mat.emissiveMap = new THREE.CanvasTexture(maps.lights);
                    mat.emissive = new THREE.Color(0xffc860);
                    mat.emissiveIntensity = 1.6;
                }
            }
            planetMesh = new THREE.Mesh(new THREE.SphereGeometry(1.62, 96, 96), mat);
            planetMesh.rotation.z = .08; // 轻微地轴倾角
            body.add(planetMesh);

            if (conf.clouds) {
                cloudMesh = new THREE.Mesh(
                    new THREE.SphereGeometry(1.655, 64, 64),
                    new THREE.MeshLambertMaterial({
                        map: new THREE.CanvasTexture(genClouds(conf.seed)),
                        transparent: true, depthWrite: false
                    })
                );
                body.add(cloudMesh);
            }

            // 大气辉光（星尘期：稀薄大气壳比核心大一圈）
            const glowColor = new THREE.Color(conf.glow);
            const atmoScale = conf.atmoLoose ? 1.08 : 1;
            const atmo = new THREE.Mesh(
                new THREE.SphereGeometry(conf.star ? 2.1 : 1.86, 64, 64),
                new THREE.ShaderMaterial({
                    uniforms: { c: { value: glowColor } },
                    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
                    fragmentShader: 'uniform vec3 c; varying vec3 vN; void main(){ float i = pow(0.58 - dot(vN, vec3(0,0,1.0)), 4.0); gl_FragColor = vec4(c, 1.0) * i * ' + (conf.star ? '2.2' : '1.0') + '; }',
                    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
                })
            );
            atmo.scale.setScalar(atmoScale);
            body.add(atmo);

            if (conf.ring) {
                const ring = new THREE.Mesh(
                    new THREE.RingGeometry(1.85, 2.35, 128),
                    new THREE.MeshBasicMaterial({
                        map: new THREE.CanvasTexture(ringTexture()),
                        side: THREE.DoubleSide, transparent: true, opacity: .95, depthWrite: false
                    })
                );
                ring.rotation.x = Math.PI / 2.55;
                ring.rotation.y = -.16;
                body.add(ring);
            }

            if (conf.dust) { // 尘埃 / 碎石 / 冰晶带（挂在 group 上不随本体缩放）
                const D = conf.dust === true ? {} : conf.dust;
                const count = D.count || 360;
                const rMin = D.rMin || 2.1, rSpan = D.rSpan || 1.1, ySpread = D.ySpread || .7;
                const pos = new Float32Array(count * 3);
                for (let i = 0; i < count; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const r = rMin + Math.random() * rSpan;
                    pos[i * 3] = Math.cos(a) * r;
                    pos[i * 3 + 1] = (Math.random() * 2 - 1) * ySpread;
                    pos[i * 3 + 2] = Math.sin(a) * r;
                }
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
                dustPoints = new THREE.Points(geo, new THREE.PointsMaterial({
                    color: D.color || 0xc2c9dd, size: D.size || .035, transparent: true,
                    opacity: D.opacity || .8, blending: THREE.AdditiveBlending, depthWrite: false
                }));
                group.add(dustPoints);
            }

            if (conf.star) { // 恒星日冕光晕（在 body 内，随体积一起变大）
                coronaSprite = new THREE.Sprite(new THREE.SpriteMaterial({
                    map: new THREE.CanvasTexture(glowSprite(conf.glow)),
                    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
                }));
                coronaSprite.scale.setScalar(6.2);
                body.add(coronaSprite);
            }
        }

        build(opts.tier || 1);

        // 拖动旋转 + 点击（位移 < 6px 判定为点击）
        let vx = .0035, dragging = false, lx = 0, downX = 0, downY = 0, moved = 0;
        renderer.domElement.style.cursor = 'grab';
        function onDown(e) {
            dragging = true; lx = downX = e.clientX; downY = e.clientY; moved = 0;
            renderer.domElement.style.cursor = 'grabbing';
        }
        renderer.domElement.addEventListener('pointerdown', onDown);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        function onMove(e) {
            if (!dragging) return;
            vx = (e.clientX - lx) * .0004 + .001;
            lx = e.clientX;
            moved = Math.max(moved, Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY));
        }
        function onUp(e) {
            if (!dragging) return;
            dragging = false;
            renderer.domElement.style.cursor = 'grab';
            if (moved < 6 && opts.onClick && e.target === renderer.domElement) opts.onClick();
        }

        let t = 0;
        let frameId = 0;
        (function loop() {
            if (destroyed) return;
            frameId = requestAnimationFrame(loop);
            t += .016;
            if (planetMesh) planetMesh.rotation.y += vx;
            if (!dragging) vx += (.0035 - vx) * .02;
            if (cloudMesh) cloudMesh.rotation.y += vx * 1.35;
            if (dustPoints) dustPoints.rotation.y += .0012;
            if (coronaSprite) coronaSprite.scale.setScalar(6.2 + Math.sin(t * 1.8) * .35);
            renderer.render(scene, camera);
        })();

        return {
            setTier(tier) { build(tier); },
            /** 手势横滑时给星球一个惯性旋转速度。 */
            rotateBy(delta) {
                vx = Math.max(-.045, Math.min(.045, vx + Number(delta || 0) * .08));
            },
            destroy() {
                destroyed = true;
                cancelAnimationFrame(frameId);
                renderer.domElement.removeEventListener('pointerdown', onDown);
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                clearGroup();
                renderer.dispose();
                renderer.domElement.remove();
            }
        };
    }

    window.Planet3D = { mount };
})();
