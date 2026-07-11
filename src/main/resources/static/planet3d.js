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

    /* ---------- 各进化阶段配置 ---------- */
    const TIERS = {
        1: { // 星尘：灰色矮行星 + 环绕尘埃粒子
            bands: [[.5, '#6f7690'], [.6, '#8c94ad'], [.7, '#a5adc4'], [1, '#c2c9dd']],
            glow: 0xaab4d8, scale: 2.2, dust: true, seed: 17
        },
        2: { // 陨石
            bands: [[.42, '#4a3826'], [.52, '#6e5844'], [.62, '#8a7057'], [.74, '#a58a6b'], [1, '#c2a98c']],
            glow: 0xc9a98c, scale: 3.0, seed: 23
        },
        3: { // 小行星
            bands: [[.44, '#28355c'], [.54, '#3d4f80'], [.64, '#5a6da0'], [.76, '#7c8fc0'], [1, '#a3b3d8']],
            glow: 0x8fa3d0, scale: 2.8, seed: 31
        },
        4: { // 岩浆行星：自发光
            bands: [[.5, '#3c1206'], [.56, '#6e2a12'], [.63, '#a8431c'], [.72, '#d05f35'], [1, '#ffb27a']],
            glow: 0xff9f6e, scale: 2.1, lava: true, seed: 11
        },
        5: { // 海洋行星
            bands: [[.5, '#0c3468'], [.56, '#155095'], [.62, '#2f85d6'], [.655, '#dfd6a8'], [.75, '#3fae72'], [1, '#2c7d52']],
            glow: 0x6edcff, scale: 2.1, sea: .62, caps: true, clouds: true, spec: true, seed: 7
        },
        6: { // 翠绿行星 + 星环
            bands: [[.46, '#11406f'], [.54, '#2470bd'], [.60, '#3a92dc'], [.635, '#dfd6a8'], [.78, '#46b877'], [1, '#2e8f58']],
            glow: 0x7bed9f, scale: 2.1, sea: .60, caps: true, clouds: true, spec: true, ring: true, seed: 3
        },
        7: { // 文明行星：星环 + 暗面夜灯
            bands: [[.48, '#241a55'], [.55, '#3a2b80'], [.62, '#5443ab'], [.66, '#c9b8f0'], [.78, '#7862c8'], [1, '#9a86e0']],
            glow: 0xa78bfa, scale: 2.1, sea: .62, clouds: true, spec: true, ring: true, lights: true, seed: 41
        },
        8: { // 恒星：自发光 + 日冕
            bands: [[.42, '#c85a10'], [.52, '#e88a20'], [.62, '#ffb340'], [.74, '#ffd166'], [1, '#fff3c4']],
            glow: 0xffd166, scale: 2.6, star: true, seed: 55
        }
    };

    /* ---------- 纹理生成 ---------- */
    function genMaps(conf) {
        const W = 512, H = 256;
        const cMap = document.createElement('canvas'); cMap.width = W; cMap.height = H;
        const cSpec = document.createElement('canvas'); cSpec.width = W; cSpec.height = H;
        const cLights = conf.lights ? document.createElement('canvas') : null;
        if (cLights) { cLights.width = W; cLights.height = H; }
        const mx = cMap.getContext('2d'), sx = cSpec.getContext('2d');
        const lx = cLights ? cLights.getContext('2d') : null;
        const img = mx.createImageData(W, H), simg = sx.createImageData(W, H);
        const limg = lx ? lx.createImageData(W, H) : null;

        for (let py = 0; py < H; py++) {
            const lat = (py / H - .5) * Math.PI;
            for (let px = 0; px < W; px++) {
                const lon = px / W * Math.PI * 2;
                const nx = Math.cos(lat) * Math.cos(lon), ny = Math.sin(lat), nz = Math.cos(lat) * Math.sin(lon);
                const n = fbm3(nx * conf.scale + 9, ny * conf.scale + 9, nz * conf.scale + 9, conf.seed);
                let color = conf.bands[conf.bands.length - 1][1];
                for (const [t, col] of conf.bands) { if (n <= t) { color = col; break; } }
                let r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
                // 细节噪声防止大色块呆板
                const d = (fbm3(nx * 7 + 30, ny * 7 + 30, nz * 7 + 30, conf.seed + 21) - .5) * 34;
                r = Math.max(0, Math.min(255, r + d));
                g = Math.max(0, Math.min(255, g + d));
                b = Math.max(0, Math.min(255, b + d));
                // 极地冰盖
                if (conf.caps && Math.abs(ny) > .78) {
                    const t = Math.min(1, (Math.abs(ny) - .78) / .12);
                    r += (245 - r) * t; g += (250 - g) * t; b += (252 - b) * t;
                }
                const i = (py * W + px) * 4;
                img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
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
        sx.putImageData(simg, 0, 0);
        if (lx) lx.putImageData(limg, 0, 0);
        return { map: cMap, spec: cSpec, lights: cLights };
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
        const c = document.createElement('canvas'); c.width = 256; c.height = 256;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(128, 128, 80, 128, 128, 128);
        grad.addColorStop(0, 'rgba(233,237,255,0)');
        grad.addColorStop(.18, 'rgba(233,237,255,.9)');
        grad.addColorStop(.42, 'rgba(170,195,255,.28)');
        grad.addColorStop(.62, 'rgba(233,237,255,.8)');
        grad.addColorStop(.82, 'rgba(190,210,255,.4)');
        grad.addColorStop(1, 'rgba(233,237,255,0)');
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
        grad.addColorStop(.4, col + '55');
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
        camera.position.set(0, 0, 5.4);

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
                    mat.emissiveMap = tex;
                    mat.emissive = new THREE.Color(0xff6a30);
                    mat.emissiveIntensity = .5;
                }
                if (conf.lights) {
                    mat.emissiveMap = new THREE.CanvasTexture(maps.lights);
                    mat.emissive = new THREE.Color(0xffc860);
                    mat.emissiveIntensity = 1.6;
                }
            }
            planetMesh = new THREE.Mesh(new THREE.SphereGeometry(1.62, 96, 96), mat);
            planetMesh.rotation.z = .08; // 轻微地轴倾角
            group.add(planetMesh);

            if (conf.clouds) {
                cloudMesh = new THREE.Mesh(
                    new THREE.SphereGeometry(1.655, 64, 64),
                    new THREE.MeshLambertMaterial({
                        map: new THREE.CanvasTexture(genClouds(conf.seed)),
                        transparent: true, depthWrite: false
                    })
                );
                group.add(cloudMesh);
            }

            // 大气辉光
            const glowColor = new THREE.Color(conf.glow);
            const atmoScale = conf.dust ? .78 : 1;
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
            group.add(atmo);

            if (conf.ring) {
                const ring = new THREE.Mesh(
                    new THREE.RingGeometry(2.15, 3.15, 128),
                    new THREE.MeshBasicMaterial({
                        map: new THREE.CanvasTexture(ringTexture()),
                        side: THREE.DoubleSide, transparent: true, opacity: .95, depthWrite: false
                    })
                );
                ring.rotation.x = Math.PI / 2.55;
                ring.rotation.y = -.16;
                group.add(ring);
            }

            if (conf.dust) { // 星尘粒子云
                const count = 360;
                const pos = new Float32Array(count * 3);
                for (let i = 0; i < count; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const r = 2.1 + Math.random() * 1.1;
                    const y = (Math.random() - .5) * 1.4;
                    pos[i * 3] = Math.cos(a) * r;
                    pos[i * 3 + 1] = y;
                    pos[i * 3 + 2] = Math.sin(a) * r;
                }
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
                dustPoints = new THREE.Points(geo, new THREE.PointsMaterial({
                    color: 0xc2c9dd, size: .035, transparent: true, opacity: .8,
                    blending: THREE.AdditiveBlending, depthWrite: false
                }));
                group.add(dustPoints);
                planetMesh.scale.setScalar(.72); // 星尘期星球还小
            }

            if (conf.star) { // 恒星日冕光晕
                coronaSprite = new THREE.Sprite(new THREE.SpriteMaterial({
                    map: new THREE.CanvasTexture(glowSprite(conf.glow)),
                    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
                }));
                coronaSprite.scale.setScalar(6.2);
                group.add(coronaSprite);
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
