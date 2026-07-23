// ===== World3D：高品质 Minecraft 风格可建造星球 =====
// 该文件不依赖模型或贴图：地形、角色、建筑、森林与湖泊均由方块程序化生成。
// 公共入口：window.World3D.mount(element, options)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';

const WORLD_HALF = 192;
const WORLD_SIZE = WORLD_HALF * 2;
const CELL = 3;
const CELLS = Math.floor(WORLD_SIZE / CELL);
const BASE_Y = -12;
const BUILD_KINDS = new Set([
    'ROCKS', 'GARDEN', 'CAMP', 'FOREST', 'FOUNTAIN', 'CRYSTAL',
    'PAVILION', 'LAKE', 'CABIN', 'FARM', 'LIBRARY', 'CASTLE',
    'CRATER', 'ROVER', 'ATMOSPHERE', 'COMET', 'SPRING',
    'SOUP', 'STROMA', 'MUSHROOM', 'SEEDVAULT', 'ARK', 'FIREFLY', 'OBSERVATORY',
    'GIFT_TREE', 'GIFT_LANTERN'
]);
const FOOTPRINT = {
    ROCKS: 8, GARDEN: 11, CAMP: 11, FOREST: 22, FOUNTAIN: 12, CRYSTAL: 9,
    PAVILION: 15, LAKE: 25, CABIN: 17, FARM: 28, LIBRARY: 32, CASTLE: 44,
    CRATER: 14, ROVER: 7, ATMOSPHERE: 12, COMET: 12, SPRING: 12,
    SOUP: 12, STROMA: 9, MUSHROOM: 10, SEEDVAULT: 16, ARK: 30, FIREFLY: 10, OBSERVATORY: 20,
    GIFT_TREE: 6, GIFT_LANTERN: 4
};
// 与 PlanetService.placementRadius 保持一致：服务端按两个占地圆半径之和判重，
// 前端预览也使用同一套半径，避免“预览可放、提交却失败”。
const PLACEMENT_RADIUS = {
    CASTLE: 22,
    LIBRARY: 18,
    ARK: 16,
    FARM: 15,
    LAKE: 15,
    FOREST: 13,
    OBSERVATORY: 12,
    SEEDVAULT: 10,
    CABIN: 8,
    PAVILION: 8,
    FOUNTAIN: 8,
    CAMP: 8,
    GARDEN: 8,
    CRATER: 8,
    SPRING: 8,
    ATMOSPHERE: 8,
    COMET: 8,
    SOUP: 8,
    ROCKS: 6,
    CRYSTAL: 6,
    ROVER: 6,
    STROMA: 6,
    MUSHROOM: 6,
    FIREFLY: 6,
    GIFT_TREE: 4,
    GIFT_LANTERN: 3
};
const BUILD_WORLD_LIMIT = 190;
const TITLES = {
    ROCKS: '月岩群', GARDEN: '繁花花园', CAMP: '星空营地', FOREST: '橡木森林',
    FOUNTAIN: '星辉喷泉', CRYSTAL: '能量水晶', PAVILION: '东方凉亭',
    LAKE: '蓝晶湖泊', CABIN: '林间木屋', FARM: '自动农场',
    LIBRARY: '知识图书馆', CASTLE: '云顶城堡',
    CRATER: '静海环形山', ROVER: '月面探测车', ATMOSPHERE: '盖亚大气机',
    COMET: '引水彗星核', SPRING: '云雾温泉', SOUP: '原初生命池',
    STROMA: '叠层石群', MUSHROOM: '荧光蘑菇林', SEEDVAULT: '万物种子库',
    ARK: '生命方舟', FIREFLY: '萤火之丘', OBSERVATORY: '星海天文台',
    GIFT_TREE: '共生树', GIFT_LANTERN: '守望灯'
};
const FLATTEN_BUILD_KINDS = new Set([
    'GARDEN', 'CAMP', 'FOUNTAIN', 'CRYSTAL', 'PAVILION', 'CABIN', 'FARM', 'LIBRARY', 'CASTLE',
    'ATMOSPHERE', 'SOUP', 'SEEDVAULT', 'ARK', 'OBSERVATORY'
]);
// 「从月壤到盖亚」：物件所属纪元。拥有的最高纪元决定全球环境（天空/地表/生态）。
const KIND_EPOCH = {
    CRATER: 0, ROCKS: 0, ROVER: 0, CRYSTAL: 0,
    ATMOSPHERE: 1,
    COMET: 2, SPRING: 2, LAKE: 2,
    SOUP: 3, STROMA: 3, MUSHROOM: 3,
    SEEDVAULT: 4, GARDEN: 4, FOREST: 4, FOUNTAIN: 4,
    ARK: 5, FIREFLY: 5,
    CAMP: 6, PAVILION: 6, CABIN: 6, FARM: 6, LIBRARY: 6, OBSERVATORY: 6, CASTLE: 6,
    GIFT_TREE: 0, GIFT_LANTERN: 0
};
function epochOfObjects(objects) {
    let epoch = 0;
    for (const obj of objects) epoch = Math.max(epoch, KIND_EPOCH[obj.kind] || 0);
    return epoch;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => {
    const t = clamp((v - a) / Math.max(.0001, b - a), 0, 1);
    return t * t * (3 - 2 * t);
};
function hash2(x, z, seed = 1) {
    const n = Math.sin(x * 127.1 + z * 311.7 + seed * 73.31) * 43758.5453123;
    return n - Math.floor(n);
}
function valueNoise(x, z, seed) {
    const xi = Math.floor(x), zi = Math.floor(z);
    const xf = x - xi, zf = z - zi;
    const sx = xf * xf * (3 - 2 * xf), sz = zf * zf * (3 - 2 * zf);
    const a = hash2(xi, zi, seed), b = hash2(xi + 1, zi, seed);
    const c = hash2(xi, zi + 1, seed), d = hash2(xi + 1, zi + 1, seed);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, sx), THREE.MathUtils.lerp(c, d, sx), sz);
}
function fbm(x, z, seed) {
    return valueNoise(x, z, seed) * .52 + valueNoise(x * 2.03, z * 2.03, seed + 17) * .29 +
        valueNoise(x * 4.13, z * 4.13, seed + 43) * .13 + valueNoise(x * 8.31, z * 8.31, seed + 91) * .06;
}
function normalizeKind(kind) {
    const result = String(kind || '').trim().toUpperCase();
    return BUILD_KINDS.has(result) ? result : '';
}
function placementRadius(kind) {
    return PLACEMENT_RADIUS[normalizeKind(kind)] || 6;
}
function placementCenterLimit(kind) {
    const normalized = normalizeKind(kind);
    const visualHalf = (FOOTPRINT[normalized] || 8) / 2;
    // 同时保证视觉模型不越出 WORLD_HALF，且满足服务端中心点限制。
    return Math.min(WORLD_HALF - visualHalf, BUILD_WORLD_LIMIT - placementRadius(normalized));
}
function normalizeObject(raw, index = 0) {
    const kind = normalizeKind(raw && (raw.kind || raw.code));
    if (!kind) return null;
    const x = Number(raw.x != null ? raw.x : raw.posX) || 0;
    const z = Number(raw.z != null ? raw.z : raw.posZ) || 0;
    const id = raw.id != null ? raw.id : `local-${kind}-${x}-${z}-${index}`;
    const level = Math.max(1, Math.min(3, Math.round(Number(raw.level) || 1)));
    return { ...raw, id, kind, title: raw.title || TITLES[kind], x, z, level };
}
function colorWithLight(color, amount) {
    const c = new THREE.Color(color);
    return amount >= 0 ? c.lerp(new THREE.Color(0xffffff), amount) : c.lerp(new THREE.Color(0x000000), -amount);
}

function mount(el, opts = {}) {
    if (!el) throw new Error('World3D.mount 需要一个有效的挂载元素');
    let destroyed = false;
    let frameId = 0;
    const readonly = opts.readonly === true;
    const seed = Number(opts.seed) || 37;
    const health = String(opts.health || 'FLOURISHING').toUpperCase();
    const isGloomy = health === 'GLOOMY';
    const isDesert = health === 'DESERT';
    const baseFogColor = new THREE.Color(isDesert ? 0x97835d : isGloomy ? 0x526279 : 0x87b6c9);
    const objectData = new Map();
    (opts.objects || opts.worldObjects || []).forEach((raw, i) => {
        const obj = normalizeObject(raw, i);
        if (obj) objectData.set(String(obj.id), obj);
    });
    const epochCeiling = opts.epoch != null ? clamp(Math.round(Number(opts.epoch) || 0), 0, 6) : null;
    const visibleEpoch = objects => {
        const unlocked = epochOfObjects(objects);
        return epochCeiling == null ? unlocked : Math.min(unlocked, epochCeiling);
    };

    /* ---------- renderer / scene ---------- */
    const coarsePointer = typeof window.matchMedia === 'function'
        && window.matchMedia('(hover: none), (pointer: coarse)').matches;
    const narrowViewport = Math.min(window.innerWidth || 1024, window.innerHeight || 768) <= 760;
    const mobileQuality = coarsePointer || narrowViewport;
    const pixelRatioCap = mobileQuality ? 1.25 : 1.75;
    const oldPosition = el.style.position;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    // 防止热更新或异常退出遗留多个 WebGL canvas。
    el.querySelectorAll('canvas[data-world3d]').forEach(canvas => canvas.remove());
    const renderer = new THREE.WebGLRenderer({
        antialias: !mobileQuality,
        powerPreference: 'high-performance'
    });
    renderer.domElement.dataset.world3d = 'true';
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isGloomy ? .95 : 1.18;
    renderer.shadowMap.enabled = true;
    // 触屏小屏设备使用低成本阴影，桌面端保留软阴影。
    renderer.shadowMap.type = mobileQuality ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
    renderer.setClearColor(baseFogColor, 1);
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;outline:none;cursor:grab;touch-action:none;';
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('aria-label', '可自由探索和建造的方块星球');
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(56, 1, .1, 1100);
    scene.fog = new THREE.FogExp2(baseFogColor, isGloomy ? .0062 : .00415);

    let composer = null, tiltH = null, tiltV = null;
    function resize() {
        const width = Math.max(1, el.clientWidth || window.innerWidth);
        const height = Math.max(1, el.clientHeight || window.innerHeight);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setPixelRatio(Math.min(pixelRatioCap, window.devicePixelRatio || 1));
        renderer.setSize(width, height, false);
        if (composer) {
            composer.setPixelRatio(Math.min(pixelRatioCap, window.devicePixelRatio || 1));
            composer.setSize(width, height);
            if (tiltH) tiltH.uniforms.h.value = .55 / height;
            if (tiltV) tiltV.uniforms.v.value = .55 / height;
        }
    }
    resize();
    window.addEventListener('resize', resize);
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (resizeObserver) resizeObserver.observe(el);

    /* ---------- material / voxel helpers ---------- */
    const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
    // 心动小镇软萌化：block() 统一使用共享圆角单元，全部建筑立刻告别硬棱立方体。
    // 非等比缩放会轻微拉伸圆角，属可接受的柔和变形。
    const roundedUnit = new RoundedBoxGeometry(1, 1, 1, 2, .1);
    const sphereUnit = new THREE.SphereGeometry(1, 14, 11);
    const cylUnit = new THREE.CylinderGeometry(1, 1, 1, 16);
    const coneUnit = new THREE.ConeGeometry(1, 1, 16);
    const materialCache = new Map();
    function mat(color, settings = {}) {
        const key = [color, settings.emissive || 0, settings.opacity == null ? 1 : settings.opacity,
            settings.metalness || 0, settings.roughness == null ? .82 : settings.roughness,
            settings.basic ? 1 : 0].join('|');
        if (materialCache.has(key)) return materialCache.get(key);
        const params = {
            color,
            roughness: settings.roughness == null ? .82 : settings.roughness,
            metalness: settings.metalness || 0,
            transparent: settings.opacity != null && settings.opacity < 1,
            opacity: settings.opacity == null ? 1 : settings.opacity,
            depthWrite: !(settings.opacity != null && settings.opacity < .9),
            emissive: settings.emissive || 0,
            emissiveIntensity: settings.emissiveIntensity || 0
        };
        const material = settings.basic ? new THREE.MeshBasicMaterial(params) : new THREE.MeshStandardMaterial(params);
        materialCache.set(key, material);
        return material;
    }
    function block(parent, x, y, z, w = 1, h = 1, d = 1, color = 0xffffff, settings = {}) {
        const mesh = new THREE.Mesh(roundedUnit, settings.material || mat(color, settings));
        mesh.position.set(x, y + h / 2, z);
        mesh.scale.set(w, h, d);
        mesh.castShadow = settings.castShadow !== false;
        mesh.receiveShadow = settings.receiveShadow !== false;
        if (settings.rotationY) mesh.rotation.y = settings.rotationY;
        if (settings.rotationX) mesh.rotation.x = settings.rotationX;
        if (settings.rotationZ) mesh.rotation.z = settings.rotationZ;
        parent.add(mesh);
        return mesh;
    }
    function stepRoof(parent, y, width, depth, color, levels = 3, overhang = 1) {
        for (let i = 0; i < levels; i++) {
            const w = Math.max(2, width - i * 2.2);
            const d = Math.max(2, depth - i * 2.2);
            block(parent, 0, y + i * .72, 0, w + overhang, .72, d + overhang, color);
        }
    }
    function addWindow(parent, x, y, z, w = 1.5, h = 2, rotationY = 0, warm = true) {
        return block(parent, x, y, z, w, h, .16, warm ? 0xffd36a : 0x68dff5, {
            emissive: warm ? 0xffa51f : 0x1bb9e8, emissiveIntensity: warm ? 1.1 : .75,
            roughness: .2, rotationY, castShadow: false
        });
    }
    /* ---- 软萌造型帮手：落地圆柱 / 圆锥 / 球体，以及豪华景观组件 ---- */
    function cyl(parent, x, y, z, rx, h, rz, color, settings = {}) {
        const m = new THREE.Mesh(cylUnit, settings.material || mat(color, settings));
        m.position.set(x, y + h / 2, z);
        m.scale.set(rx, h, rz);
        m.castShadow = settings.castShadow !== false;
        m.receiveShadow = settings.receiveShadow !== false;
        if (settings.rotationX) m.rotation.x = settings.rotationX;
        if (settings.rotationZ) m.rotation.z = settings.rotationZ;
        parent.add(m);
        return m;
    }
    function cone(parent, x, y, z, r, h, color, settings = {}) {
        const m = new THREE.Mesh(coneUnit, settings.material || mat(color, settings));
        m.position.set(x, y + h / 2, z);
        m.scale.set(r, h, r * (settings.squashZ || 1));
        m.castShadow = settings.castShadow !== false;
        parent.add(m);
        return m;
    }
    function orb(parent, x, y, z, r, color, settings = {}) {
        const m = new THREE.Mesh(sphereUnit, settings.material || mat(color, settings));
        m.position.set(x, y, z);
        m.scale.setScalar(r);
        m.castShadow = settings.castShadow !== false;
        parent.add(m);
        return m;
    }
    /** 暖光庭院灯柱 */
    function lampPost(parent, x, y, z) {
        cyl(parent, x, y, z, .15, 2.5, .15, 0x8d857c);
        orb(parent, x, y + 2.8, z, .38, 0xffe0b0,
            { emissive: 0xffb54d, emissiveIntensity: 1.6, castShadow: false });
    }
    /** 白色圆头栅栏（圆弧段） */
    function picketArc(parent, cx, y, cz, radius, a0, a1, step = .3) {
        for (let a = a0; a <= a1; a += step) {
            cyl(parent, cx + Math.cos(a) * radius, y, cz + Math.sin(a) * radius,
                .13, 1.05, .13, 0xf7f2e8, { castShadow: false });
            orb(parent, cx + Math.cos(a) * radius, y + 1.15, cz + Math.sin(a) * radius,
                .16, 0xf7f2e8, { castShadow: false });
        }
    }
    /** 花丛（小球花 + 草垫） */
    function flowerTuft(parent, x, y, z, color) {
        orb(parent, x, y + .16, z, .34, 0x86c380, { castShadow: false });
        orb(parent, x, y + .5, z, .22, color,
            { emissive: color, emissiveIntensity: .3, castShadow: false });
    }
    /** 奶油踏石小径（两点间） */
    function stonePath(parent, x0, y, z0, x1, z1, count = 5) {
        for (let i = 0; i <= count; i++) {
            const t = i / count;
            const wob = Math.sin(i * 2.1) * .5;
            cyl(parent, x0 + (x1 - x0) * t + wob, y, z0 + (z1 - z0) * t,
                .8, .18, .65, 0xefe4cb, { castShadow: false });
        }
    }
    /** 袅袅炊烟（独立材质，避免共享缓存被动画污染） */
    function chimneySmoke(parent, x, y, z) {
        for (let i = 0; i < 3; i++) {
            const puffMat = new THREE.MeshStandardMaterial({
                color: 0xf2f2ee, transparent: true, opacity: .3, depthWrite: false, roughness: 1
            });
            const puff = orb(parent, x, y + i * .8, z, .4, 0xffffff,
                { material: puffMat, castShadow: false });
            animated.push({ type: 'smoke', mesh: puff, baseY: y + i * .8, baseS: .4, phase: i * .8 });
        }
    }
    function addLantern(parent, x, y, z, color = 0xffb33b) {
        block(parent, x, y, z, .65, .8, .65, color, {
            emissive: color, emissiveIntensity: 1.7, castShadow: false
        });
    }

    /* ---------- 纪元环境（从荒原到盖亚） ----------
     * stage 0 洪荒纪：无大气——白天也是星空、灰色荒岩、无云无水无树。
     * stage 1 大气纪：天空第一次变蓝，云开始流动，星星在白天隐去。
     * stage 2 海洋纪：天然湖出现，低洼积水。
     * stage 3 生命纪：水边泛起苔藓绿。
     * stage 4 绿色纪：草原覆盖全球，森林随星球等级越来越密。
     * stage 5 动物纪：飞鸟、蝴蝶、游鱼与漫步的小兽。 */
    let stage = visibleEpoch(objectData.values());
    function envFor(s) {
        if (s < 1) {
            return { // 无大气：黑色太空 + 刺眼的白色阳光
                skyTop: 0x020309, skyHorizon: 0x0d1120, skyBottom: 0x04050d,
                fog: 0x0a0d18, fogDensity: .0007, starsOp: .95,
                sunColor: 0xffffff, sunIntensity: isGloomy ? 2.2 : 3.1,
                hemiSky: 0xaab4cc, hemiGround: 0x3a3d46, hemiIntensity: .8,
                exposure: 1.08
            };
        }
        // 有大气之后：心动小镇式马卡龙粉彩（阴霾/荒漠仍保留情绪差异）
        return {
            skyTop: isDesert ? 0x7fb2d8 : isGloomy ? 0x5b6b85 : 0x6fc2ec,
            skyHorizon: isDesert ? 0xf2d3a0 : isGloomy ? 0xa8b2c2 : 0xd9f1f7,
            skyBottom: isDesert ? 0xe2c194 : isGloomy ? 0x76839a : 0xf4e7cf,
            fog: isDesert ? 0xe8d2a8 : isGloomy ? 0x9aa6b8 : 0xcfe9f0,
            fogDensity: isGloomy ? .0026 : .0011,
            starsOp: isGloomy ? .3 : .12,
            sunColor: isGloomy ? 0xc2cede : 0xfff0d2, sunIntensity: isGloomy ? 1.3 : 2.15,
            hemiSky: isDesert ? 0xffe2b8 : 0xc2e8f5,
            hemiGround: isDesert ? 0xc9a075 : (s < 4 ? 0x6d7280 : 0x8cbb8e),
            hemiIntensity: isGloomy ? .85 : 1.15,
            exposure: isGloomy ? 1 : 1.14
        };
    }
    const env0 = envFor(stage);
    renderer.toneMappingExposure = env0.exposure;

    const skyUniforms = {
        topColor: { value: new THREE.Color(env0.skyTop) },
        horizonColor: { value: new THREE.Color(env0.skyHorizon) },
        bottomColor: { value: new THREE.Color(env0.skyBottom) }
    };
    scene.fog = new THREE.FogExp2(new THREE.Color(env0.fog), env0.fogDensity);
    renderer.setClearColor(new THREE.Color(env0.fog), 1);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(650, 32, 18), new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, uniforms: skyUniforms,
        vertexShader: 'varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader: 'varying vec3 vPos;uniform vec3 topColor;uniform vec3 horizonColor;uniform vec3 bottomColor;void main(){float h=normalize(vPos).y;vec3 c=mix(bottomColor,horizonColor,smoothstep(-.28,.08,h));c=mix(c,topColor,smoothstep(.05,.75,h));gl_FragColor=vec4(c,1.);}'
    }));
    scene.add(sky);

    const starGeometry = new THREE.BufferGeometry();
    const starPositions = [];
    for (let i = 0; i < 850; i++) {
        const a = hash2(i, 2, seed) * Math.PI * 2;
        const y = 55 + hash2(i, 8, seed) * 420;
        const r = 480;
        starPositions.push(Math.cos(a) * r, y, Math.sin(a) * r);
    }
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    let starsBaseOpacity = env0.starsOp;
    const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({
        color: 0xd9edff, size: 1.65, transparent: true, opacity: starsBaseOpacity,
        sizeAttenuation: false, depthWrite: false
    }));
    scene.add(stars);

    // （远景不再放山丘：草地一路延伸到地平线，靠颜色渐融消失，画面更通透）

    const sunOrb = new THREE.Mesh(new THREE.BoxGeometry(16, 16, 3), mat(0xffeb9a, {
        basic: true, emissive: 0xffd56a, emissiveIntensity: 2
    }));
    sunOrb.position.set(-155, 105, -245);
    sunOrb.rotation.y = -.55;
    scene.add(sunOrb);

    const sun = new THREE.DirectionalLight(env0.sunColor, env0.sunIntensity);
    sun.position.set(-90, 145, -75);
    sun.castShadow = true;
    sun.shadow.mapSize.set(mobileQuality ? 1024 : 1536, mobileQuality ? 1024 : 1536);
    Object.assign(sun.shadow.camera, { left: -95, right: 95, top: 95, bottom: -95, near: 10, far: 360 });
    sun.shadow.bias = -.00035;
    sun.shadow.radius = 5; // 软萌柔影
    scene.add(sun);
    // DirectionalLight.target 必须在场景树中，但只需添加一次。
    scene.add(sun.target);
    const hemi = new THREE.HemisphereLight(env0.hemiSky, env0.hemiGround, env0.hemiIntensity);
    scene.add(hemi);
    scene.add(new THREE.AmbientLight(0x20304e, .18));

    // 心动小镇质感的一半来自镜头：bloom 柔光 + tilt-shift 微缩景深（桌面端启用）
    if (!mobileQuality) {
        composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        composer.addPass(new UnrealBloomPass(
            new THREE.Vector2(el.clientWidth || 1024, el.clientHeight || 768), .2, .5, .88));
        tiltH = new ShaderPass(HorizontalTiltShiftShader);
        tiltV = new ShaderPass(VerticalTiltShiftShader);
        tiltH.uniforms.r.value = .5;
        tiltV.uniforms.r.value = .5;
        composer.addPass(tiltH);
        composer.addPass(tiltV);
        composer.addPass(new OutputPass());
        resize();
    }

    const clouds = [];
    for (let i = 0; i < 12; i++) {
        const cloud = new THREE.Group();
        const cloudColor = isGloomy ? 0x8b98ab : 0xffffff;
        const parts = 4 + Math.floor(hash2(i, 4, seed) * 4);
        for (let p = 0; p < parts; p++) {
            const puff = new THREE.Mesh(sphereUnit,
                mat(cloudColor, { opacity: isGloomy ? .6 : .55, castShadow: false }));
            puff.position.set((p - parts / 2) * 4.2, Math.sin(p * 1.7) * 1.2, (p % 2) * 2.4 - 1.2);
            puff.scale.set(4.4 + (p % 3), 2.6 + (p % 2) * .8, 3.6);
            puff.castShadow = false; puff.receiveShadow = false;
            cloud.add(puff);
        }
        cloud.position.set((hash2(i, 11, seed) - .5) * 430, 48 + hash2(i, 12, seed) * 43,
            (hash2(i, 13, seed) - .5) * 350);
        cloud.scale.setScalar(.7 + hash2(i, 14, seed) * 1.25);
        cloud.visible = stage >= 1; // 没有大气就没有云
        scene.add(cloud);
        clouds.push({ group: cloud, speed: .45 + hash2(i, 16, seed) * .55 });
    }

    /* 纪元切换的渐变（天空/雾/光照插值）与降雨转场 */
    const envTransitions = [];
    let rainFx = null;
    function lerpColorTo(color, target, k) { color.lerp(_envColor.set(target), k); }
    const _envColor = new THREE.Color();
    function applyEnvInstant(env) {
        skyUniforms.topColor.value.set(env.skyTop);
        skyUniforms.horizonColor.value.set(env.skyHorizon);
        skyUniforms.bottomColor.value.set(env.skyBottom);
        scene.fog.color.set(env.fog);
        scene.fog.density = env.fogDensity;
        renderer.setClearColor(scene.fog.color, 1);
        sun.color.set(env.sunColor);
        sun.intensity = env.sunIntensity;
        hemi.color.set(env.hemiSky);
        hemi.groundColor.set(env.hemiGround);
        hemi.intensity = env.hemiIntensity;
        renderer.toneMappingExposure = env.exposure;
        starsBaseOpacity = env.starsOp;
    }
    function startEnvTransition(env, duration = 4.5) {
        envTransitions.length = 0;
        envTransitions.push({ env, t: 0, duration });
    }
    function tickEnvTransition(dt) {
        const tr = envTransitions[0];
        if (!tr) return;
        tr.t += dt;
        const smoothK = Math.min(1, dt * (8.8 / tr.duration));
        lerpColorTo(skyUniforms.topColor.value, tr.env.skyTop, smoothK);
        lerpColorTo(skyUniforms.horizonColor.value, tr.env.skyHorizon, smoothK);
        lerpColorTo(skyUniforms.bottomColor.value, tr.env.skyBottom, smoothK);
        lerpColorTo(scene.fog.color, tr.env.fog, smoothK);
        scene.fog.density += (tr.env.fogDensity - scene.fog.density) * smoothK;
        renderer.setClearColor(scene.fog.color, 1);
        lerpColorTo(sun.color, tr.env.sunColor, smoothK);
        sun.intensity += (tr.env.sunIntensity - sun.intensity) * smoothK;
        lerpColorTo(hemi.color, tr.env.hemiSky, smoothK);
        lerpColorTo(hemi.groundColor, tr.env.hemiGround, smoothK);
        hemi.intensity += (tr.env.hemiIntensity - hemi.intensity) * smoothK;
        renderer.toneMappingExposure += (tr.env.exposure - renderer.toneMappingExposure) * smoothK;
        starsBaseOpacity += (tr.env.starsOp - starsBaseOpacity) * smoothK;
        if (tr.t >= tr.duration) {
            applyEnvInstant(tr.env);
            envTransitions.length = 0;
        }
    }
    function startRain(duration = 6) {
        stopRain();
        const count = mobileQuality ? 400 : 900;
        const positions = new Float32Array(count * 3);
        const speeds = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - .5) * 260;
            positions[i * 3 + 1] = 20 + Math.random() * 90;
            positions[i * 3 + 2] = (Math.random() - .5) * 260;
            speeds[i] = 55 + Math.random() * 45;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const points = new THREE.Points(geo, new THREE.PointsMaterial({
            color: 0x9fd4ff, size: .38, transparent: true, opacity: .75, depthWrite: false
        }));
        scene.add(points);
        rainFx = { points, speeds, life: duration };
    }
    function stopRain() {
        if (!rainFx) return;
        scene.remove(rainFx.points);
        rainFx.points.geometry.dispose();
        rainFx.points.material.dispose();
        rainFx = null;
    }
    function tickRain(dt) {
        if (!rainFx) return;
        rainFx.life -= dt;
        const pos = rainFx.points.geometry.attributes.position;
        for (let i = 0; i < rainFx.speeds.length; i++) {
            let y = pos.getY(i) - rainFx.speeds[i] * dt;
            if (y < -6) y = 25 + Math.random() * 85;
            pos.setY(i, y);
        }
        pos.needsUpdate = true;
        rainFx.points.position.x = player.position.x;
        rainFx.points.position.z = player.position.z;
        if (rainFx.life < 1.2) rainFx.points.material.opacity = Math.max(0, rainFx.life / 1.2) * .75;
        if (rainFx.life <= 0) stopRain();
    }

    /* ---------- terrain calculation ---------- */
    // 星球与生俱来的撞击疤痕：几座环形山（凹陷 + 凸起的坑缘），荒芜期一目了然，
    // 草原覆盖后则变成天然的盆地与丘环。
    const impactCraters = [];
    for (let i = 0; i < 6; i++) {
        const a = hash2(i, 401, seed) * Math.PI * 2;
        const dist = 62 + hash2(i, 402, seed) * 110;
        impactCraters.push({
            x: Math.cos(a) * dist,
            z: Math.sin(a) * dist,
            radius: 11 + hash2(i, 403, seed) * 10,
            depth: 2.6 + hash2(i, 404, seed) * 2.6
        });
    }
    function craterShape(x, z) {
        let delta = 0;
        for (const c of impactCraters) {
            const d = Math.hypot(x - c.x, z - c.z);
            if (d > c.radius * 1.35) continue;
            const inner = smooth(c.radius * .95, c.radius * .35, d);      // 坑内 0..1
            const rim = smooth(c.radius * 1.35, c.radius * 1.0, d) *
                        smooth(c.radius * .78, c.radius * 1.0, d);        // 坑缘环
            delta += -c.depth * inner + rim * 1.6;
        }
        return delta;
    }
    function baseTerrainHeight(x, z) {
        const broad = fbm(x * .013 + 4, z * .013 - 7, seed) - .5;
        const detail = fbm(x * .041 - 13, z * .041 + 9, seed + 33) - .5;
        const ridges = Math.abs(fbm(x * .008 + 70, z * .008 - 50, seed + 70) - .5);
        let h = broad * 18 + detail * 5 + Math.max(0, ridges - .27) * 16 + craterShape(x, z);
        const center = Math.hypot(x, z);
        if (center < 35) h = THREE.MathUtils.lerp(.8, h, smooth(18, 35, center));
        return h; // 软萌化：不再按方块量化，山丘是连绵的曲面
    }
    // 天然湖属于海洋纪：引水彗星（stage>=2）之后，这条洼地才会真正蓄水。
    const naturalLake = { x: -68, z: -55, radius: 16, floor: baseTerrainHeight(-68, -55) - 5,
        surface: baseTerrainHeight(-68, -55) - 1.2, natural: true };
    let lakeCache = [naturalLake];
    let flattenCache = [];
    function refreshTerrainModifiers() {
        const values = [...objectData.values()];
        const natural = stage >= 2 ? [naturalLake] : [];
        lakeCache = [...natural, ...values.filter(o => o.kind === 'LAKE').map(o => ({
            x: o.x, z: o.z, radius: 11.5, floor: baseTerrainHeight(o.x, o.z) - 4,
            surface: baseTerrainHeight(o.x, o.z) - 1.1
        }))];
        flattenCache = values.filter(o => FLATTEN_BUILD_KINDS.has(o.kind));
    }
    refreshTerrainModifiers();
    function lakeSpecs() {
        return lakeCache;
    }
    function lakeAt(x, z) {
        let best = null;
        for (const lake of lakeSpecs()) {
            const d = Math.hypot(x - lake.x, z - lake.z);
            if (d < lake.radius && (!best || d < best.distance)) best = { ...lake, distance: d };
        }
        return best;
    }
    function heightAt(x, z) {
        let h = baseTerrainHeight(x, z);
        for (const lake of lakeSpecs()) {
            const d = Math.hypot(x - lake.x, z - lake.z);
            if (d < lake.radius + 5) {
                const carved = THREE.MathUtils.lerp(lake.floor, h, smooth(lake.radius - 2, lake.radius + 5, d));
                h = Math.min(h, carved);
            }
        }
        // 大型建筑拥有方块地基，附近地面会自动压平，避免建筑悬空。
        for (const obj of flattenCache) {
            const radius = (FOOTPRINT[obj.kind] || 12) * .54;
            const d = Math.hypot(x - obj.x, z - obj.z);
            if (d < radius + 4) {
                const target = baseTerrainHeight(obj.x, obj.z);
                h = THREE.MathUtils.lerp(target, h, smooth(radius, radius + 4, d));
            }
        }
        return Math.round(h / .25) * .25;
    }
    function playerGroundAt(x, z) {
        const lake = lakeAt(x, z);
        return lake ? Math.max(heightAt(x, z), lake.surface - .72) : heightAt(x, z);
    }
    function obstacleAt(x, z) {
        for (const obj of objectData.values()) {
            const dx = Math.abs(x - obj.x), dz = Math.abs(z - obj.z);
            switch (obj.kind) {
                case 'CASTLE':
                    // 正门和中庭可进入，外墙仍有实体感。
                    if ((dx > 15 && dx < 21 && dz < 20) || (dz > 14 && dz < 20 && (dx > 4 || z < obj.z))) return true;
                    break;
                case 'LIBRARY': if (dx < 14.5 && dz < 10.5 && !(dz > 8.5 && dx < 2.8)) return true; break;
                case 'CABIN': if (dx < 7 && dz < 6 && !(dz > 4.8 && dx < 1.6)) return true; break;
                case 'PAVILION': break; // 四面开放，可以自由走进去。
                case 'FOUNTAIN': if (Math.hypot(dx, dz) < 5.3) return true; break;
                case 'CRYSTAL': if (Math.hypot(dx, dz) < 2.8) return true; break;
                case 'FARM': if (dx > 6 && dx < 13 && dz < 7) return true; break;
                case 'CAMP': if (dx < 6 && dz < 4 && x < obj.x + .8) return true; break;
                default: break;
            }
        }
        return false;
    }

    const terrainGroup = new THREE.Group();
    scene.add(terrainGroup);
    // 软萌地形：一整张平滑起伏的顶点色曲面（比世界大一圈，边缘融进远景）。
    const TER_SIZE = 880, TER_SEG = 150;
    const terrainGeo = new THREE.PlaneGeometry(TER_SIZE, TER_SIZE, TER_SEG, TER_SEG);
    terrainGeo.rotateX(-Math.PI / 2);
    terrainGeo.setAttribute('color',
        new THREE.BufferAttribute(new Float32Array(terrainGeo.attributes.position.count * 3), 3));
    const terrainMat = new THREE.MeshStandardMaterial({ roughness: .95, metalness: 0, vertexColors: true });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = false;
    terrainMesh.frustumCulled = false;
    terrainGroup.add(terrainMesh);
    const _tc = new THREE.Color(), _tc2 = new THREE.Color();
    const _horizon = new THREE.Color();
    function terrainColorInto(out, x, z, h) {
        const far = smooth(290, 430, Math.hypot(x, z)); // 远处渐融进天际色

        const moisture = fbm(x * .05, z * .05, seed + 301);
        let waterDist = Infinity;
        for (const lake of lakeSpecs()) {
            waterDist = Math.min(waterDist, Math.hypot(x - lake.x, z - lake.z) - lake.radius);
        }
        if (stage < 4) {
            // 银灰月壤：细腻的明暗起伏，坑洼略深
            out.set(0xb2b7c1).lerp(_tc2.set(0xcdd2da), smooth(4, 13, h));
            out.lerp(_tc2.set(0x9aa0aa), smooth(.62, .38, moisture) * .4);
            if (stage >= 3 && waterDist < 34) {
                // 生命纪：苔藓从水边向外蔓延
                const mossy = smooth(34, 4, waterDist) * smooth(.4, .66, moisture);
                out.lerp(_tc2.set(0x7fbf78), Math.min(1, mossy * 1.2));
            }
            if (far > 0) out.lerp(_horizon, far);
            return out;
        }
        if (isDesert) {
            out.set(0xecd29a).lerp(_tc2.set(0xd8b878), smooth(.4, .7, moisture));
        } else {
            // 抹茶草地：湿润处更嫩绿
            out.set(isGloomy ? 0x7aa583 : 0x86cb80)
                .lerp(_tc2.set(isGloomy ? 0x8fb996 : 0xa6df9e), smooth(.38, .72, moisture));
            // 高处露出薰衣草灰岩
            out.lerp(_tc2.set(0xb6b0c6), smooth(8, 14, h) * .8);
        }
        // 水畔奶油沙滩
        if (waterDist < 6) out.lerp(_tc2.set(0xf2e2b6), smooth(6, 1.2, waterDist));
        if (lakeAt(x, z)) out.set(0xe8d5a2);
        if (far > 0) out.lerp(_horizon, far);
        return out;
    }
    function rebuildTerrain() {
        _horizon.set(envFor(stage).fog);
        const pos = terrainGeo.attributes.position;
        const col = terrainGeo.attributes.color;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), z = pos.getZ(i);
            const h = heightAt(x, z);
            pos.setY(i, h);
            terrainColorInto(_tc, x, z, h);
            col.setXYZ(i, _tc.r, _tc.g, _tc.b);
        }
        pos.needsUpdate = true;
        col.needsUpdate = true;
        terrainGeo.computeVertexNormals();
        terrainGeo.computeBoundingSphere();
    }
    rebuildTerrain();

    // 自然水体也使用方块岸线 + 半透明水面，不依赖外部水贴图。
    const naturalWater = new THREE.Mesh(new THREE.CircleGeometry(naturalLake.radius, 36), mat(0x6fc3e6, {
        opacity: .78, roughness: .14, metalness: .1, emissive: 0x2a7ea0, emissiveIntensity: .22
    }));
    naturalWater.rotation.x = -Math.PI / 2;
    naturalWater.position.set(naturalLake.x, naturalLake.surface + .05, naturalLake.z);
    naturalWater.receiveShadow = true;
    naturalWater.visible = stage >= 2;
    scene.add(naturalWater);

    /* ---------- ambient voxel nature ---------- */
    const natureGroup = new THREE.Group();
    scene.add(natureGroup);
    function voxelTree(parent, x, z, size = 1, autumn = false, base = 0) {
        // 软萌树：圆柱树干 + 蓬蓬球树冠（心动小镇式棒棒糖树）
        const leafColors = autumn ? [0xf2b26a, 0xe89a55, 0xf7c98b] :
            (isGloomy ? [0x6f9d7c, 0x7fae8a, 0x638f70] : [0x7cc47f, 0x93d68e, 0x6bb573]);
        const trunk = new THREE.Mesh(cylUnit, mat(0xa97f5c, { roughness: .9 }));
        trunk.position.set(x, base + 1.7 * size, z);
        trunk.scale.set(.42 * size, 3.4 * size, .42 * size);
        trunk.castShadow = true;
        parent.add(trunk);
        const puffs = [[0, 4.1, 0, 2.35], [-1.25, 3.4, .55, 1.55], [1.15, 3.5, -.6, 1.6], [0, 5.4, 0, 1.45]];
        puffs.forEach(([px, py, pz, r], i) => {
            const puff = new THREE.Mesh(sphereUnit, mat(leafColors[i % 3], { roughness: .85 }));
            puff.position.set(x + px * size, base + py * size, z + pz * size);
            puff.scale.setScalar(r * size);
            puff.castShadow = true;
            parent.add(puff);
        });
    }
    function nearPlacedObject(x, z, padding = 0) {
        for (const obj of objectData.values()) {
            if (Math.hypot(x - obj.x, z - obj.z) < (FOOTPRINT[obj.kind] || 10) / 2 + padding) return true;
        }
        return false;
    }
    const worldLevel = Math.max(1, Math.round(Number(opts.level) || 1));
    const growingTrees = [];
    function buildNature(growAnim = false) {
        natureGroup.clear();
        growingTrees.length = 0;
        // 树木属于绿色纪（种子库之后），森林密度随星球等级增长：星球越强，绿意越浓。
        if (!isDesert && stage >= 4) {
            const target = isGloomy ? 55 : Math.min(96, 26 + worldLevel * 7);
            let made = 0;
            for (let i = 0; i < 260 && made < target; i++) {
                const x = (hash2(i, 22, seed) - .5) * (WORLD_SIZE - 24);
                const z = (hash2(i, 29, seed) - .5) * (WORLD_SIZE - 24);
                if (Math.hypot(x, z) < 38 || nearPlacedObject(x, z, 8) || lakeAt(x, z)) continue;
                const h = heightAt(x, z);
                if (h > 9 || h < -3) continue;
                const tree = new THREE.Group();
                voxelTree(tree, 0, 0, .72 + hash2(i, 33, seed) * .66, hash2(i, 34, seed) > .9, 0);
                tree.position.set(x, h, z);
                natureGroup.add(tree);
                if (growAnim) {
                    tree.scale.setScalar(.02);
                    growingTrees.push({ group: tree, delay: made * .06, t: 0 });
                }
                made++;
            }
        }
        for (let i = 0; i < 42; i++) {
            const x = (hash2(i, 51, seed) - .5) * (WORLD_SIZE - 30);
            const z = (hash2(i, 57, seed) - .5) * (WORLD_SIZE - 30);
            if (Math.hypot(x, z) < 31 || nearPlacedObject(x, z, 5) || lakeAt(x, z)) continue;
            const rock = new THREE.Group();
            const s = .6 + hash2(i, 63, seed) * 1.4;
            const rockColor = stage < 4 ? 0x9aa0aa : (isDesert ? 0xcbb492 : 0xb7bec6);
            const pebble = new THREE.Mesh(sphereUnit, mat(rockColor, { roughness: .95 }));
            pebble.scale.set(1.1 * s, .62 * s, .9 * s);
            pebble.rotation.y = hash2(i, 64, seed) * Math.PI;
            pebble.castShadow = true;
            rock.add(pebble);
            rock.position.set(x, heightAt(x, z) + .2 * s, z);
            natureGroup.add(rock);
        }
    }
    buildNature();

    /* ---------- 动物纪生灵：鸟群 / 蝴蝶 / 游鱼 / 漫步小兽 ---------- */
    const lifeGroup = new THREE.Group();
    scene.add(lifeGroup);
    const lifeAnim = { birds: [], butterflies: [], fish: [], critters: [] };
    function buildLife() {
        lifeGroup.clear();
        lifeAnim.birds.length = lifeAnim.butterflies.length = 0;
        lifeAnim.fish.length = lifeAnim.critters.length = 0;
        if (stage < 5) return;
        for (let f = 0; f < 2; f++) {
            for (let b = 0; b < 5; b++) {
                const bird = new THREE.Group();
                block(bird, 0, 0, 0, 1.1, .35, .55, 0x2d3a4a, { castShadow: false });
                const wl = block(bird, -.85, .12, 0, 1.5, .12, .5, 0x3d4d61, { castShadow: false });
                const wr = block(bird, .85, .12, 0, 1.5, .12, .5, 0x3d4d61, { castShadow: false });
                lifeGroup.add(bird);
                lifeAnim.birds.push({ group: bird, wl, wr, radius: 95 + f * 38 + b * 3,
                    speed: .09 + f * .03, phase: b * 1.1 + f * 2.4, height: 44 + f * 9 + b * 1.5 });
            }
        }
        const flyColors = [0xffc2e0, 0xffe08a, 0x9fd8ff];
        for (let i = 0; i < 9; i++) {
            const fly = new THREE.Group();
            const c = flyColors[i % 3];
            const wl = block(fly, -.28, 0, 0, .5, .06, .62, c, { castShadow: false, emissive: c, emissiveIntensity: .25 });
            const wr = block(fly, .28, 0, 0, .5, .06, .62, c, { castShadow: false, emissive: c, emissiveIntensity: .25 });
            lifeGroup.add(fly);
            lifeAnim.butterflies.push({ group: fly, wl, wr,
                cx: (hash2(i, 501, seed) - .5) * 150, cz: (hash2(i, 502, seed) - .5) * 150, phase: i * 1.7 });
        }
        for (let i = 0; i < 5; i++) {
            const fish = block(lifeGroup, 0, 0, 0, 1.3, .25, .45, 0x35586e, { castShadow: false, opacity: .85 });
            lifeAnim.fish.push({ mesh: fish, radius: 3 + i * 1.7, speed: .5 + i * .13, phase: i * 1.3 });
        }
        for (let i = 0; i < 3; i++) {
            const critter = new THREE.Group();
            if (i < 2) { // 雪白小兔
                block(critter, 0, .1, 0, .8, .7, 1.1, 0xe8e3da);
                block(critter, 0, .75, .45, .55, .5, .55, 0xe8e3da);
                block(critter, -.14, 1.2, .45, .13, .55, .2, 0xe8e3da);
                block(critter, .14, 1.2, .45, .13, .55, .2, 0xe8e3da);
                block(critter, 0, .28, -.62, .3, .3, .3, 0xffffff);
            } else { // 方块小鹿
                block(critter, 0, .9, 0, .9, .9, 1.9, 0x9a6d45);
                block(critter, 0, 1.75, .85, .55, .6, .6, 0x9a6d45);
                for (const [lx, lz] of [[-.3, .7], [.3, .7], [-.3, -.7], [.3, -.7]]) {
                    block(critter, lx, 0, lz, .22, .95, .22, 0x855c3a);
                }
                block(critter, -.2, 2.4, .85, .1, .5, .1, 0x6d4526);
                block(critter, .2, 2.4, .85, .1, .5, .1, 0x6d4526);
            }
            lifeGroup.add(critter);
            const x = (hash2(i, 511, seed) - .5) * 120, z = (hash2(i, 512, seed) - .5) * 120;
            lifeAnim.critters.push({ group: critter, x, z, tx: x, tz: z, heading: 0,
                wait: i, speed: i < 2 ? 2.4 : 1.9 });
        }
    }
    buildLife();
    function animateLife(dt) {
        for (const b of lifeAnim.birds) {
            const t = elapsed * b.speed + b.phase;
            b.group.position.set(Math.cos(t) * b.radius,
                b.height + Math.sin(elapsed * .9 + b.phase) * 2.2, Math.sin(t) * b.radius);
            b.group.rotation.y = -t - Math.PI / 2;
            const flap = Math.sin(elapsed * 9 + b.phase) * .55;
            b.wl.rotation.z = flap; b.wr.rotation.z = -flap;
        }
        for (const f of lifeAnim.butterflies) {
            const t = elapsed * .7 + f.phase;
            const x = f.cx + Math.sin(t) * 6 + Math.sin(t * 2.3) * 2.5;
            const z = f.cz + Math.cos(t * .8) * 6;
            f.group.position.set(x, heightAt(x, z) + 2.2 + Math.sin(t * 3) * .7, z);
            const flap = Math.sin(elapsed * 14 + f.phase) * .9;
            f.wl.rotation.z = flap; f.wr.rotation.z = -flap;
        }
        for (const f of lifeAnim.fish) {
            const t = elapsed * f.speed + f.phase;
            f.mesh.position.set(naturalLake.x + Math.cos(t) * f.radius,
                naturalLake.surface - .55, naturalLake.z + Math.sin(t) * f.radius);
            f.mesh.rotation.y = -t;
        }
        for (const c of lifeAnim.critters) {
            c.wait -= dt;
            const dx = c.tx - c.x, dz = c.tz - c.z;
            const dist = Math.hypot(dx, dz);
            if (c.wait <= 0 && dist < 1.5) {
                c.tx = clamp(c.x + (Math.random() - .5) * 46, -150, 150);
                c.tz = clamp(c.z + (Math.random() - .5) * 46, -150, 150);
                if (lakeAt(c.tx, c.tz)) { c.tx = c.x; c.tz = c.z; }
                c.wait = 2 + Math.random() * 4;
            } else if (dist >= 1.5) {
                const target = Math.atan2(dx, dz);
                c.heading += shortestAngle(c.heading, target) * Math.min(1, dt * 4);
                c.x += Math.sin(c.heading) * c.speed * dt;
                c.z += Math.cos(c.heading) * c.speed * dt;
            }
            const hop = dist >= 1.5 ? Math.abs(Math.sin(elapsed * 8)) * .3 : 0;
            c.group.position.set(c.x, heightAt(c.x, c.z) + hop, c.z);
            c.group.rotation.y = c.heading;
        }
    }

    /* ---------- 纪元推进：一次购买，全球巨变 ---------- */
    function applyStage(next, options = {}) {
        next = Math.max(0, Math.min(6, Number(next) || 0));
        if (next === stage) return;
        const prev = stage;
        stage = next;
        const animate = options.animate !== false;
        if (animate) startEnvTransition(envFor(stage), 5.2);
        else { envTransitions.length = 0; applyEnvInstant(envFor(stage)); }
        clouds.forEach(c => { c.group.visible = stage >= 1; });
        refreshTerrainModifiers();
        rebuildTerrain();
        naturalWater.visible = stage >= 2;
        if (animate && prev < 2 && stage >= 2) startRain(6.5); // 第一场雨
        buildNature(animate && prev < 4 && stage >= 4);        // 森林破土而出
        refreshNatureVisibility();
        // 地形与配色变化后，所有已放置物件重新贴地重建
        for (const id of [...objectGroups.keys()]) removeVisualObject(id);
        for (const data of objectData.values()) createWorldObject(data);
        buildLife();
        // 大气纪达成后角色可以摘下头盔呼吸
        if (player.rig) updateAvatar({});
    }

    function refreshNatureVisibility() {
        natureGroup.children.forEach(child => {
            child.visible = !lakeAt(child.position.x, child.position.z) && !nearPlacedObject(child.position.x, child.position.z, 1);
        });
    }
    refreshNatureVisibility();

    // 出生广场：奶油色圆台 + 薄荷发光圆柱（着陆场）
    const spawn = new THREE.Group();
    const plazaBase = new THREE.Mesh(cylUnit, mat(0xf2e8d4, { roughness: .92 }));
    plazaBase.position.set(0, heightAt(0, 0) + .16, 0);
    plazaBase.scale.set(11.5, .5, 11.5);
    plazaBase.receiveShadow = true; plazaBase.castShadow = false;
    spawn.add(plazaBase);
    const plazaInner = new THREE.Mesh(cylUnit, mat(0xe6d7ba, { roughness: .9 }));
    plazaInner.position.set(0, heightAt(0, 0) + .42, 0);
    plazaInner.scale.set(7.2, .3, 7.2);
    plazaInner.receiveShadow = true; plazaInner.castShadow = false;
    spawn.add(plazaInner);
    for (let i = 0; i < 8; i++) { // 环形圆礅踏石
        const a = i / 8 * Math.PI * 2;
        const sx = Math.sin(a) * 14.5, sz = Math.cos(a) * 14.5;
        const step = new THREE.Mesh(cylUnit, mat(0xefe4cb, { roughness: .92 }));
        step.position.set(sx, heightAt(sx, sz) + .12, sz);
        step.scale.set(1.5, .26, 1.5);
        step.receiveShadow = true; step.castShadow = false;
        spawn.add(step);
    }
    for (let i = 0; i < 4; i++) { // 薄荷光柱
        const a = i * Math.PI / 2 + Math.PI / 4;
        const x = Math.sin(a) * 9.4, z = Math.cos(a) * 9.4;
        const pylon = new THREE.Mesh(cylUnit, mat(0x9fe8dc, {
            emissive: 0x35c9b8, emissiveIntensity: 1.1, roughness: .4
        }));
        pylon.position.set(x, heightAt(x, z) + 1.5, z);
        pylon.scale.set(.42, 2.6, .42);
        pylon.castShadow = false;
        spawn.add(pylon);
        const tip = new THREE.Mesh(sphereUnit, mat(0xcaf7f0, { emissive: 0x5fe0d2, emissiveIntensity: 1.6, castShadow: false }));
        tip.position.set(x, heightAt(x, z) + 3.1, z);
        tip.scale.setScalar(.6);
        tip.castShadow = false;
        spawn.add(tip);
    }
    scene.add(spawn);

    /* ---------- constructible object catalogue ---------- */
    const objectRoot = new THREE.Group();
    scene.add(objectRoot);
    const objectGroups = new Map();
    const animated = [];

    function foundation(parent, width, depth, y = 0, color = 0x52626a) {
        block(parent, 0, y, 0, width + 2, .7, depth + 2, 0x39484f);
        block(parent, 0, y + .7, 0, width, .42, depth, color);
        for (let x = -width / 2 + 1; x < width / 2; x += 2) {
            block(parent, x, y + 1.12, depth / 2 - .1, 1.6, .13, .8, colorWithLight(color, .11), { castShadow: false });
        }
        return y + 1.25;
    }
    function column(parent, x, z, y, height, color = 0xd5c39c, trim = 0xf1e6cc) {
        block(parent, x, y, z, 1.25, height, 1.25, color);
        block(parent, x, y, z, 1.7, .48, 1.7, trim);
        block(parent, x, y + height - .48, z, 1.7, .48, 1.7, trim);
    }
    function flag(parent, x, y, z, color = 0x62e6e2) {
        block(parent, x, y, z, .22, 5.4, .22, 0x30383d, { metalness: .55 });
        block(parent, x + 1.25, y + 3.65, z, 2.5, 1.25, .16, color, {
            emissive: color, emissiveIntensity: .22, castShadow: false
        });
    }
    function makeRocks(g, obj) {
        const L = (obj && obj.level) || 1;
        if (L >= 2) { // 巨石阵与独石碑
            block(g, 4.6, 0, -3.4, 2.6, 4.2, 2.2, 0x5d6b73, { rotationY: .5 });
            block(g, -4.2, 0, 3.8, 2.2, 3.4, 2, 0x51606a, { rotationY: -.4 });
            block(g, 0, 0, 0, 1.4, 6.2, 1.2, 0x74838c, { rotationY: .22 });
        }
        if (L >= 3) { // 岩缝里长出发光晶簇
            for (let i = 0; i < 5; i++) {
                const a = i / 5 * Math.PI * 2;
                block(g, Math.cos(a) * 3.2, 1.2, Math.sin(a) * 3.2, .5, 1.6 + (i % 2), .5,
                    0x7ef2ff, { emissive: 0x3fd9f2, emissiveIntensity: .95, rotationY: a });
            }
            const rockLight = new THREE.PointLight(0x5fe0f2, 1.3, 16, 2);
            rockLight.position.set(0, 4, 0); g.add(rockLight);
        }
        const colors = [0x56646b, 0x68777b, 0x47545d, 0x829094];
        const centerHeight = heightAt(obj.x, obj.z);
        for (let i = 0; i < 10; i++) {
            const a = hash2(i, 2, seed) * Math.PI * 2;
            const r = 1 + hash2(i, 3, seed) * 4.2;
            const w = 1.3 + hash2(i, 4, seed) * 2.6;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            const localY = heightAt(obj.x + x, obj.z + z) - centerHeight;
            block(g, x, localY, z, w, .8 + hash2(i, 5, seed) * 2.8,
                w * (.7 + hash2(i, 6, seed) * .5), colors[i % colors.length], {
                    rotationY: hash2(i, 7, seed) * Math.PI
                });
        }
    }
    function makeGarden(g, obj) {
        const L = (obj && obj.level) || 1;
        if (L >= 2) { // 绿篱围边 + 更繁盛的花丛
            for (let x = -5.4; x <= 5.4; x += 1.8) {
                block(g, x, .3, 4.8, 1.7, 1.1, .9, 0x2f6b3a, { castShadow: false });
                block(g, x, .3, -4.8, 1.7, 1.1, .9, 0x2f6b3a, { castShadow: false });
            }
            const extra = [0xff8fb0, 0xffe27a, 0xa8f0ff];
            for (let i = 0; i < 16; i++) {
                const x = (hash2(i, 208, seed) - .5) * 8.6, z = (hash2(i, 209, seed) - .5) * 6.8;
                block(g, x, .36, z, .16, .7, .16, 0x2e7037, { castShadow: false });
                block(g, x, 1.1, z, .5, .42, .5, extra[i % 3], { emissive: extra[i % 3], emissiveIntensity: .14, castShadow: false });
            }
        }
        if (L >= 3) { // 玫瑰花拱门与暖光石灯
            for (const zx of [-1.5, 1.5]) block(g, zx, .3, 5.6, .5, 4.2, .5, 0xe9e2d2);
            block(g, 0, 4.4, 5.6, 3.8, .55, .6, 0x3a7a45);
            for (let i = 0; i < 6; i++) {
                block(g, -1.4 + i * .56, 4.75, 5.6, .34, .34, .5, i % 2 ? 0xff6f95 : 0xffd0dc,
                    { emissive: 0xff5f8a, emissiveIntensity: .3, castShadow: false });
            }
            addLantern(g, -4.9, 1.4, 4.9, 0xffc46a);
            addLantern(g, 4.9, 1.4, 4.9, 0xffc46a);
        }
        const soil = 0x68452f, path = 0xcab786;
        block(g, 0, .04, 0, 11, .32, 8.8, 0x3e773f, { castShadow: false });
        block(g, 0, .36, 0, 1.6, .18, 10, path, { castShadow: false });
        const colors = [0xff5f7d, 0xffd34e, 0x7ce8ff, 0xb684ff, 0xffffff];
        for (let i = 0; i < 34; i++) {
            const side = i % 2 ? -1 : 1;
            const x = side * (1.5 + hash2(i, 8, seed) * 3.5);
            const z = (hash2(i, 9, seed) - .5) * 7.2;
            block(g, x, .36, z, .16, .65, .16, 0x2e7037, { castShadow: false });
            block(g, x, 1.01, z, .48, .4, .48, colors[i % colors.length], {
                emissive: colors[i % colors.length], emissiveIntensity: .08, castShadow: false
            });
        }
        block(g, -4.4, .34, 0, .55, 1, 8.5, soil);
        block(g, 4.4, .34, 0, .55, 1, 8.5, soil);
    }
    function makeCamp(g, obj) {
        const L = (obj && obj.level) || 1;
        if (L >= 2) { // 第二顶帐篷与补给箱
            for (let i = 0; i < 3; i++) {
                block(g, 1.2, .1 + i * .66, -3.6, 4.6 - i * 1.1, .7, 3.4, i === 2 ? 0x5d7a52 : 0x74945f);
            }
            block(g, -4.6, .1, 2.6, 1.3, 1.1, 1.3, 0x8a6238);
            block(g, -4.6, 1.2, 2.6, 1, .5, 1, 0xa87c46);
        }
        if (L >= 3) { // 营地彩灯串与冒险旗
            for (const px of [-4.4, 5.4]) block(g, px, .1, -1.2, .3, 4.6, .3, 0x54402c);
            for (let i = 0; i < 8; i++) {
                const t = i / 7;
                const lx = -4.4 + t * 9.8;
                const ly = 4.4 - Math.sin(t * Math.PI) * .9;
                const glow = [0xffd166, 0x7bed9f, 0x74c0ff, 0xff8fa3][i % 4];
                block(g, lx, ly, -1.2, .3, .3, .3, glow, { emissive: glow, emissiveIntensity: 1.4, castShadow: false });
            }
            flag(g, 5.4, 4.7, -1.2, 0xffb84d);
        }
        const canvas = 0xc78f4a;
        // 方块帐篷，阶梯式斜顶
        for (let i = 0; i < 4; i++) {
            block(g, -2.4, .1 + i * .72, -1, 6.8 - i * 1.2, .75, 4.8, i === 3 ? 0x8d5830 : canvas);
        }
        block(g, -2.4, .15, 1.45, 1.15, 2.2, .2, 0x293345);
        // 篝火与木桩
        block(g, 3, .1, 1.2, 3.2, .35, 3.2, 0x596168);
        block(g, 3, .4, 1.2, 1.6, .52, .45, 0x6d4528, { rotationY: Math.PI / 4 });
        block(g, 3, .4, 1.2, 1.6, .52, .45, 0x6d4528, { rotationY: -Math.PI / 4 });
        const fire = block(g, 3, .88, 1.2, .8, 1.5, .8, 0xffa129, {
            emissive: 0xff6a00, emissiveIntensity: 2.2, castShadow: false
        });
        const light = new THREE.PointLight(0xff8b32, 2.4, 18, 2);
        light.position.set(3, 3.1, 1.2); g.add(light);
        animated.push({ type: 'fire', mesh: fire, light, seed: hash2(2, 80, seed) * 8 });
        for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2;
            block(g, 3 + Math.cos(a) * 2.5, .1, 1.2 + Math.sin(a) * 2.5, 1.5, .75, .7, 0x765034, {
                rotationY: -a
            });
        }
    }
    function makeForest(g, obj) {
        // 购买森林不是摆一个 emoji，而是真正生成一片可穿行的生态区域。
        const L = (obj && obj.level) || 1;
        const centerHeight = heightAt(obj.x, obj.z);
        if (L >= 2) { // 更密的树冠与林间蘑菇
            for (let i = 0; i < 8; i++) {
                const a = hash2(i, 221, seed) * Math.PI * 2;
                const r = 4 + Math.sqrt(hash2(i, 222, seed)) * 8.6;
                const x = Math.cos(a) * r, z = Math.sin(a) * r;
                voxelTree(g, x, z, .9 + hash2(i, 223, seed) * .7, false,
                    heightAt(obj.x + x, obj.z + z) - centerHeight);
            }
            for (let i = 0; i < 7; i++) {
                const a = hash2(i, 224, seed) * Math.PI * 2, r = 2 + hash2(i, 225, seed) * 8;
                const x = Math.cos(a) * r, z = Math.sin(a) * r;
                const y = heightAt(obj.x + x, obj.z + z) - centerHeight;
                block(g, x, y, z, .3, .7, .3, 0xd8cdb4, { castShadow: false });
                block(g, x, y + .7, z, .8, .4, .8, 0xc2543a, { castShadow: false });
            }
        }
        if (L >= 3) { // 森林之心：巨大古树与暖色挂灯
            block(g, 0, 0, 0, 2.4, 9.5, 2.4, 0x5c3d26);
            block(g, 0, 8.2, 0, 9.4, 3.4, 8.8, 0x2f6d3b);
            block(g, -2.6, 10.4, 1.2, 5.4, 2.6, 5, 0x397d42);
            block(g, 2.6, 11, -1.4, 5.8, 2.8, 5.2, 0x4a9147);
            block(g, 0, 13.2, 0, 4.4, 2, 4.2, 0x54a14e);
            addLantern(g, 1.6, 6.2, 1.6, 0xffc46a);
            addLantern(g, -1.8, 5.4, -1.2, 0xffa94f);
            const heart = new THREE.PointLight(0xffc06a, 1.6, 24, 2);
            heart.position.set(0, 7.5, 0); g.add(heart);
        }
        for (let i = 0; i < 22; i++) {
            const a = hash2(i, 101, seed) * Math.PI * 2;
            const r = 2.5 + Math.sqrt(hash2(i, 102, seed)) * 9.2;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            voxelTree(g, x, z, .72 + hash2(i, 103, seed) * .72,
                i % 9 === 0, heightAt(obj.x + x, obj.z + z) - centerHeight);
        }
        for (let i = 0; i < 18; i++) {
            const a = hash2(i, 104, seed) * Math.PI * 2, r = hash2(i, 105, seed) * 10;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            const localY = heightAt(obj.x + x, obj.z + z) - centerHeight;
            block(g, x, localY + .02, z, .35, .55, .35, 0x83bd45, { castShadow: false });
        }
    }
    function makeFountain(g, obj) {
        const L = (obj && obj.level) || 1;
        const marble = 0xf2ece0, trim = 0xe4d8c4;
        cyl(g, 0, 0, 0, 7.6, .4, 7.6, 0xefe6d2, { castShadow: false });
        cyl(g, 0, .4, 0, 6.2, .3, 6.2, trim, { castShadow: false });
        cyl(g, 0, .7, 0, 4.6, 1.1, 4.6, marble);
        cyl(g, 0, 1.55, 0, 4.1, .3, 4.1, 0x8fd8ee,
            { opacity: .8, emissive: 0x2e9cc4, emissiveIntensity: .5, castShadow: false });
        cyl(g, 0, 1.7, 0, .9, 2.6, .9, marble);
        cyl(g, 0, 4.2, 0, 2.1, .5, 2.1, marble);
        cyl(g, 0, 4.6, 0, 1.7, .25, 1.7, 0x9fe0f2,
            { opacity: .85, emissive: 0x37a8cc, emissiveIntensity: .6, castShadow: false });
        const jet = cyl(g, 0, 4.8, 0, .5, 3.6, .5, 0xbdeeff,
            { opacity: .55, emissive: 0x4fc4e8, emissiveIntensity: .8, castShadow: false });
        const light = new THREE.PointLight(0x6fd8f2, 1.8, 22, 2);
        light.position.set(0, 5.6, 0); g.add(light);
        animated.push({ type: 'waterJet', mesh: jet, light, baseY: jet.position.y });
        for (let i = 0; i < 6; i++) {
            const a = i / 6 * Math.PI * 2;
            flowerTuft(g, Math.cos(a) * 6.9, .1, Math.sin(a) * 6.9, [0xff9db8, 0xffe08a, 0xa8d8ff][i % 3]);
        }
        if (L >= 2) { // 四角小水柱 + 庭院灯
            for (const [cx2, cz2] of [[-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2]]) {
                cyl(g, cx2, 1.55, cz2, .3, 1.9, .3, 0xbdeeff,
                    { opacity: .5, emissive: 0x4fc4e8, emissiveIntensity: .6, castShadow: false });
            }
            lampPost(g, -6.4, .4, 2.2); lampPost(g, 6.4, .4, -2.2);
        }
        if (L >= 3) { // 鎏金环 + 环绕水珠光点
            cyl(g, 0, 4.85, 0, 2.3, .18, 2.3, 0xf2cf7a,
                { emissive: 0xc79b3a, emissiveIntensity: .4, castShadow: false });
            for (let i = 0; i < 6; i++) {
                const a = i / 6 * Math.PI * 2;
                const gem = orb(g, Math.cos(a) * 3.4, 5.6, Math.sin(a) * 3.4, .3, 0xbdeeff,
                    { emissive: 0x6fd8f2, emissiveIntensity: 1.5, castShadow: false });
                animated.push({ type: 'crownGem', mesh: gem, angle: a, baseY: 5.6, radius: 3.4, cx: 0, cz: 0, speed: 1.1 });
            }
        }
    }

    function makeCrystal(g, obj) {
        const L = (obj && obj.level) || 1;
        if (L >= 2) { // 外圈晶柱
            for (let i = 0; i < 4; i++) {
                const a = i / 4 * Math.PI * 2 + .4;
                block(g, Math.cos(a) * 3.1, .5, Math.sin(a) * 3.1, .9, 5.2 + (i % 2) * 1.6, .9,
                    0x8f7bff, { emissive: 0x7361ff, emissiveIntensity: .8, rotationY: a, rotationZ: .1 });
            }
        }
        if (L >= 3) { // 悬浮的水晶之心
            const shard = block(g, 0, 11.5, 0, 1.6, 2.6, 1.6, 0xbef4ff,
                { emissive: 0x6fe9ff, emissiveIntensity: 1.6, opacity: .92, rotationZ: .5 });
            const shardLight = new THREE.PointLight(0x8ff0ff, 2.6, 34, 2);
            shardLight.position.set(0, 12.4, 0); g.add(shardLight);
            animated.push({ type: 'castleCore', mesh: shard, light: shardLight, baseY: shard.position.y });
        }
        block(g, 0, .02, 0, 7, .5, 7, 0x344453);
        const colors = [0x54f6ff, 0x7e75ff, 0xbd68ff];
        for (let i = 0; i < 7; i++) {
            const a = i / 7 * Math.PI * 2, r = i ? 1.3 + (i % 2) * .8 : 0;
            const h = i ? 3.5 + (i % 3) * 1.5 : 8.5;
            const crystal = block(g, Math.cos(a) * r, .5, Math.sin(a) * r, 1.25, h, 1.25,
                colors[i % colors.length], { emissive: colors[i % colors.length], emissiveIntensity: .85,
                    metalness: .25, roughness: .22, rotationY: a });
            crystal.rotation.z = i % 2 ? .16 : -.12;
        }
        const light = new THREE.PointLight(0x6ae9ff, 2.6, 31, 2);
        light.position.set(0, 5, 0); g.add(light);
        animated.push({ type: 'crystal', group: g, light, seed: hash2(9, 90, seed) * 9 });
    }
    function makePavilion(g, obj) {
        const L = (obj && obj.level) || 1;
        const red = 0xd0655c, roofC = 0x5e8a99, gold = 0xe8bc6a;
        cyl(g, 0, 0, 0, 7.4, .5, 7.4, 0xf2e8d6, { castShadow: false });
        cyl(g, 0, .5, 0, 6.2, .35, 6.2, 0xe6d9c0, { castShadow: false });
        for (let i = 0; i < 6; i++) {
            const a = i / 6 * Math.PI * 2;
            cyl(g, Math.cos(a) * 4.6, .85, Math.sin(a) * 4.6, .38, 5.6, .38, red);
        }
        cyl(g, 0, 6.45, 0, 6.6, .5, 6.6, 0x4a5a66);
        cone(g, 0, 6.95, 0, 7.2, 2.4, roofC);
        cone(g, 0, 9.35, 0, 4.2, 1.7, roofC);
        orb(g, 0, 11.6, 0, .55, gold, { emissive: 0xc7912a, emissiveIntensity: .7 });
        addLantern(g, 0, 4.6, 0, 0xffc46a);
        if (L >= 2) { // 石灯小径与圆凳
            stonePath(g, 0, .06, 7.6, 0, 13.5, 4);
            lampPost(g, -2.4, .1, 8.8); lampPost(g, 2.4, .1, 8.8);
            for (let i = 0; i < 3; i++) {
                const a = Math.PI * (.9 + i * .4);
                cyl(g, Math.cos(a) * 5.4, .85, Math.sin(a) * 5.4, .7, .5, .7, 0xc9605a, { castShadow: false });
            }
        }
        if (L >= 3) { // 月牙锦鲤池 + 檐角灯笼 + 金脊环
            for (let i = 0; i < 9; i++) {
                const a = -.9 + i * .25;
                cyl(g, Math.cos(a) * 8.8, .1, Math.sin(a) * 8.8, 1.35, .22, 1.35, 0x8fd8ee,
                    { opacity: .8, emissive: 0x2e9cc4, emissiveIntensity: .4, castShadow: false });
            }
            for (let i = 0; i < 3; i++) {
                const a = i / 3 * Math.PI * 2 + .5;
                addLantern(g, Math.cos(a) * 4.9, 5.9, Math.sin(a) * 4.9, 0xffb86a);
            }
            cyl(g, 0, 9.1, 0, 4.5, .22, 4.5, gold,
                { emissive: 0xc7912a, emissiveIntensity: .35, castShadow: false });
            const warm = new THREE.PointLight(0xffc07a, 1.8, 24, 2);
            warm.position.set(0, 5.5, 0); g.add(warm);
        }
    }

    function makeLake(g, obj) {
        const L = (obj && obj.level) || 1;
        const centerGround = heightAt(obj.x, obj.z);
        if (L >= 2) { // 芦苇丛与岸边渔灯
            for (let i = 0; i < 10; i++) {
                const a = hash2(i, 231, seed) * Math.PI * 2, r = 10.2 + hash2(i, 232, seed) * 1.6;
                block(g, Math.cos(a) * r, baseTerrainHeight(obj.x, obj.z) - 1.1 - centerGround + .2, Math.sin(a) * r,
                    .18, 1.6 + (i % 3) * .5, .18, 0x7fae63, { castShadow: false });
            }
            addLantern(g, 10.8, baseTerrainHeight(obj.x, obj.z) - 1.1 - centerGround + 1.6, 3.2, 0xffc46a);
            block(g, 10.8, baseTerrainHeight(obj.x, obj.z) - 1.1 - centerGround, 3.2, .32, 1.7, .32, 0x6b4c2e);
        }
        if (L >= 3) { // 叠水瀑布与夜光湖心
            const ySurf = baseTerrainHeight(obj.x, obj.z) - 1.1 - centerGround;
            block(g, -6.5, ySurf + .4, -6.5, 4.6, 2.4, 4, 0x5d6b73, { rotationY: .6 });
            block(g, -6.5, ySurf + 2.8, -6.5, 3.2, 1.4, 2.8, 0x6b7a82, { rotationY: .6 });
            block(g, -5.6, ySurf + 1.1, -5.6, 1.3, 2.6, 1.1, 0x9fe8ff,
                { opacity: .6, emissive: 0x37c6e8, emissiveIntensity: .9, rotationY: .6, castShadow: false });
            const lakeGlow = new THREE.PointLight(0x49d6ff, 1.8, 26, 2);
            lakeGlow.position.set(0, ySurf + 1.4, 0); g.add(lakeGlow);
        }
        const surface = baseTerrainHeight(obj.x, obj.z) - 1.1;
        const y = surface - centerGround;
        const water = new THREE.Mesh(new THREE.CircleGeometry(11.8, 28), mat(0x3baad2, {
            opacity: .77, roughness: .12, metalness: .18, emissive: 0x0a567a, emissiveIntensity: .26
        }));
        water.rotation.x = -Math.PI / 2;
        water.position.y = y;
        water.receiveShadow = true;
        g.add(water);
        // 方块岸线、水草、莲叶，使它看起来属于世界而不是一张贴图。
        for (let i = 0; i < 30; i++) {
            const a = i / 30 * Math.PI * 2;
            const r = 11.2 + (i % 3) * .45;
            block(g, Math.cos(a) * r, y - .24, Math.sin(a) * r, 1.9, .55, 1.5,
                i % 5 === 0 ? 0x657b54 : 0xbda978, { rotationY: -a, castShadow: false });
        }
        for (let i = 0; i < 11; i++) {
            const a = hash2(i, 117, seed) * Math.PI * 2, r = hash2(i, 118, seed) * 8;
            block(g, Math.cos(a) * r, y + .06, Math.sin(a) * r, 1.2, .1, 1.2, 0x4e9b51, { castShadow: false });
        }
        animated.push({ type: 'lake', mesh: water, baseY: y, seed: hash2(obj.x, obj.z, seed) * 10 });
    }
    function makeCabin(g, obj) {
        const L = (obj && obj.level) || 1;
        const wall = 0xf5ead8, roof = 0xe8a08a, roofD = 0xd88a74, wood = 0xa97b58;
        cyl(g, 0, 0, 0, 8.6, .4, 8.6, 0xefe6d2, { castShadow: false });
        block(g, 0, .4, 0, 9.5, 5, 7.6, wall);
        for (const wx of [-4.78, 4.78]) block(g, wx, 1.2, 0, .2, 3.4, 6.8, 0xe8dcc4, { castShadow: false });
        block(g, 0, 5.4, 0, 10.4, 1.5, 8.4, roof);
        block(g, 0, 6.9, 0, 8.2, 1.4, 6.6, roofD);
        block(g, 0, 8.3, 0, 5.4, 1.2, 4.4, roof);
        block(g, 0, .5, 3.85, 2.2, 3.4, .3, wood);
        orb(g, .7, 2.1, 4.05, .12, 0xf2cf7a, { emissive: 0xc79b3a, emissiveIntensity: .8, castShadow: false });
        addWindow(g, -3.1, 2.2, 3.85, 1.9, 1.9, 0, true);
        addWindow(g, 3.1, 2.2, 3.85, 1.9, 1.9, 0, true);
        cyl(g, 3.2, 8.7, -1.6, .6, 2.4, .6, 0xcabfae);
        chimneySmoke(g, 3.2, 11.4, -1.6);
        stonePath(g, 0, .06, 4.6, 0, 9.5, 4);
        flowerTuft(g, -2.2, .4, 4.6, 0xff9db8);
        flowerTuft(g, 2.4, .4, 4.8, 0xffe08a);
        if (L >= 2) { // 门廊 + 白栅栏 + 窗台花箱 + 庭院灯
            block(g, 0, .4, 5.2, 6.8, .45, 2.8, 0xe0cfae, { castShadow: false });
            for (const px of [-3.1, 3.1]) cyl(g, px, .85, 6.2, .22, 2.9, .22, wood);
            block(g, 0, 3.75, 6.2, 7, .5, 1.2, roofD);
            picketArc(g, 0, .1, 2.5, 10.6, Math.PI * .12, Math.PI * .88);
            for (const wx of [-3.1, 3.1]) block(g, wx, 1.15, 4.05, 2, .45, .4, 0xd9628a,
                { emissive: 0xb03a60, emissiveIntensity: .25, castShadow: false });
            lampPost(g, -4.6, .1, 6.8);
        }
        if (L >= 3) { // 阁楼 + 金风向标 + 侧院菜圃 + 家的暖光
            block(g, 0, 9.4, 0, 3.6, 2.2, 3.2, wall);
            block(g, 0, 11.5, 0, 4.4, 1, 3.8, roofD);
            orb(g, 0, 10.4, 1.72, .55, 0xffd98f, { emissive: 0xffa53d, emissiveIntensity: 1.1, castShadow: false });
            cyl(g, 0, 12.4, 0, .1, 1.4, .1, 0x8d857c);
            orb(g, 0, 13.9, 0, .3, 0xf2cf7a, { emissive: 0xc7912a, emissiveIntensity: .9, castShadow: false });
            cyl(g, -6.4, .15, -3, 2.6, .3, 2, 0xb98d62, { castShadow: false });
            for (let i = 0; i < 3; i++) orb(g, -7.2 + i * .9, .7, -3, .32,
                [0x8fce88, 0xffb37a, 0x9fd8ff][i], { castShadow: false });
            lampPost(g, 4.6, .1, 6.8);
            const homely = new THREE.PointLight(0xffc78a, 1.5, 20, 2);
            homely.position.set(0, 3.5, 3); g.add(homely);
        }
    }

    function makeFarm(g, obj) {
        const L = (obj && obj.level) || 1;
        if (L >= 2) { // 玻璃暖房与稻草人
            block(g, -9.8, .4, 6.5, 6.5, .4, 5.4, 0x9b8969);
            block(g, -9.8, .8, 6.5, 6, 3.4, 5, 0xbfe8f0, { opacity: .38, castShadow: false });
            block(g, -9.8, 4.2, 6.5, 6.4, .5, 5.3, 0xe5f4f7, { opacity: .6, castShadow: false });
            block(g, 1.5, .4, 0, .3, 3.4, .3, 0x6b4e2f);
            block(g, 1.5, 2.7, 0, 2.4, .3, .3, 0x6b4e2f);
            block(g, 1.5, 3.4, 0, .9, .9, .9, 0xd9a557);
        }
        if (L >= 3) { // 白顶粮仓与方块羊群
            block(g, 14.8, .4, 5.5, 4.6, 8.5, 4.6, 0xcf5f4a);
            stepRoof(g, 8.9, 5.4, 5.4, 0xe8e0d0, 3, 0);
            for (let i = 0; i < 3; i++) {
                const sx = -3 + i * 3.4, sz = 8.9;
                block(g, sx, .5, sz, 1.5, 1.1, 2, 0xf2efe6);
                block(g, sx, 1.3, sz + 1, .8, .7, .7, 0x3a3c40);
            }
            for (let x = -5.4; x <= 6.4; x += 1.6) block(g, x, .4, 7.6, .3, 1, .3, 0x6b4e2f);
            for (let x = -5.4; x <= 6.4; x += 1.6) block(g, x, .4, 10.4, .3, 1, .3, 0x6b4e2f);
        }
        const fieldColor = isDesert ? 0x8d6c3b : 0x705034;
        block(g, 0, .02, 0, 27, .38, 22, fieldColor, { castShadow: false });
        // 田垄与水渠
        for (let z = -8; z <= 8; z += 3.2) {
            block(g, -2.8, .4, z, 17, .45, 1.5, 0xcaa33d, { castShadow: false });
            for (let x = -10; x < 6; x += 1.4) block(g, x, .84, z, .22, .85, .22, 0xe2be48, { castShadow: false });
        }
        block(g, 6.8, .38, 0, 1.8, .12, 21, 0x3da6c8, { opacity: .78, castShadow: false });
        // 方块风车
        const towerY = .4;
        block(g, 9.5, towerY, -4, 5.6, 10, 5.6, 0xe2d3ad);
        stepRoof(g, towerY + 10, 7, 7, 0x704535, 3, 0);
        const wheel = new THREE.Group();
        wheel.position.set(9.5, towerY + 8.1, -6.9);
        block(wheel, 0, -.35, 0, 12, .7, .5, 0xe8dcc4);
        block(wheel, 0, -6, 0, .7, 12, .5, 0xe8dcc4);
        block(wheel, 0, 0, 0, 1.4, 1.4, .9, 0x805733);
        g.add(wheel);
        animated.push({ type: 'windmill', group: wheel });
        block(g, -9.5, .4, -7.5, 4.5, 3.8, 4, 0x784f31);
        stepRoof(g, 4.2, 5.5, 5, 0x3f3030, 2, 0);
    }

    // 图书馆：三层新古典方块建筑、发光巨窗、中央穹顶与知识光柱。
    function makeLibrary(g, obj) {
        const L = (obj && obj.level) || 1;
        if (L >= 2) { // 鎏金穹顶沿与前庭绿篱
            block(g, 0, 19.2, -1.2, 7.2, .5, 5.8, 0xd7ad52);
            for (const hx of [-8.5, 8.5]) {
                block(g, hx, 1.3, 13.4, 4.2, 1.2, 1.4, 0x2f6b3a, { castShadow: false });
                block(g, hx, 2.5, 13.4, 1, .9, 1, 0x3a7a45, { castShadow: false });
            }
        }
        if (L >= 3) { // 双子知识光柱与学院旗帜
            for (const bx of [-13.2, 13.2]) {
                block(g, bx, 9.7, 0, 1, 7, 1, 0x74edff,
                    { opacity: .5, emissive: 0x28d9ff, emissiveIntensity: 1.2, castShadow: false });
                const wing = new THREE.PointLight(0x66e5ff, 1.6, 26, 2);
                wing.position.set(bx, 14, 0); g.add(wing);
            }
            flag(g, -10, 13.2, 9.25, 0x74c0ff);
            flag(g, 10, 13.2, 9.25, 0x74c0ff);
        }
        const y = foundation(g, 31, 25, 0, 0xbcae91);
        const stone = 0xf0e6d0, lightStone = 0xfaf3e2, dark = 0x7d94a0;
        block(g, 0, y, -1.2, 27.5, 11, 20, stone);
        // 两侧翼楼形成高级的层次和城市天际线。
        block(g, -13.2, y, 0, 6, 8.4, 17, 0xb8a88d);
        block(g, 13.2, y, 0, 6, 8.4, 17, 0xb8a88d);
        block(g, 0, y + 10.9, -1.2, 28.5, 1, 21, dark);
        block(g, 0, y + 11.9, -1.2, 25, .65, 18.5, lightStone);
        // 正面台阶
        for (let i = 0; i < 5; i++) block(g, 0, y - .5 + i * .42, 10.8 + i * .62,
            17 - i * 1.8, .42, 2.6, colorWithLight(stone, i * .025));
        // 宏伟柱廊
        for (let x = -10; x <= 10; x += 4) column(g, x, 9.25, y + .15, 10.6, stone, lightStone);
        block(g, 0, y + 10.5, 9.25, 25.4, 1.15, 3, dark);
        block(g, 0, y + 11.65, 9.25, 23.5, .55, 2.45, 0xd7ad52);
        // 大门与窗阵
        block(g, 0, y + .25, 10.13, 4, 6.8, .38, 0x172432);
        addWindow(g, 0, y + 2.2, 10.36, 2.4, 3.7, 0, true);
        for (const floor of [2.1, 6.2]) for (const x of [-11, -7.2, 7.2, 11]) {
            addWindow(g, x, y + floor, 8.86, 2.2, 2.65, 0, true);
            addWindow(g, x, y + floor, -11.27, 2.2, 2.65, 0, true);
        }
        // 中央方块穹顶和发光灯塔
        block(g, 0, y + 12.55, -1.2, 12, 2, 10, dark);
        block(g, 0, y + 14.55, -1.2, 9.2, 1.45, 7.4, 0x36536a);
        block(g, 0, y + 16, -1.2, 6.2, 1.35, 5, 0x3f7590);
        block(g, 0, y + 17.35, -1.2, 3.5, 1.1, 2.8, 0xd7ad52);
        block(g, 0, y + 18.45, -1.2, 1, 5.4, 1, 0x74edff, {
            opacity: .74, emissive: 0x28d9ff, emissiveIntensity: 1.55, castShadow: false
        });
        const beacon = new THREE.PointLight(0x78eaff, 2.9, 48, 2);
        beacon.position.set(0, y + 21.5, -1.2); g.add(beacon);
        // 书徽标：像素化开卷图案
        block(g, -1.25, y + 8.2, 10.83, 2.25, 1.55, .22, 0xf1d070, { rotationZ: -.18 });
        block(g, 1.25, y + 8.2, 10.83, 2.25, 1.55, .22, 0xf1d070, { rotationZ: .18 });
        addLantern(g, -12.7, y + 2.5, 10, 0xffc84b);
        addLantern(g, 12.7, y + 2.5, 10, 0xffc84b);
    }

    // 城堡：城墙、门楼、五座塔、垛口、旗帜与悬浮核心组成的终极奇观。
    function makeCastle(g, obj) {
        const L = (obj && obj.level) || 1;
        const wallC = 0xf3ece2, towerC = 0xefe6d8, roofC = 0xe895a8, gold = 0xf2cf7a;
        cyl(g, 0, 0, 0, 21, .5, 21, 0xefe6d2, { castShadow: false });
        function tower(x, z, r, h, coneH) {
            cyl(g, x, .5, z, r, h, r, towerC);
            cyl(g, x, .5 + h, z, r * 1.18, .7, r * 1.18, 0xe6d9c6);
            cone(g, x, 1.2 + h, z, r * 1.28, coneH, roofC);
            addWindow(g, x, .5 + h * .55, z + r - .05, 1.1, 1.7, 0, true);
        }
        block(g, 0, .5, -2, 15, 9.5, 11, wallC);
        block(g, 0, 10, -2, 16, 1, 12, 0xe6d9c6);
        block(g, 0, 11, -2, 12.5, 2.8, 9, wallC);
        block(g, 0, 13.8, -2, 13.2, .8, 9.6, 0xe6d9c6);
        cone(g, 0, 14.6, -2, 5.6, 4.6, roofC);
        orb(g, 0, 19.6, -2, .5, gold, { emissive: 0xc7912a, emissiveIntensity: .8 });
        tower(-8.6, -8, 3, 12, 5);
        tower(8.6, -8, 3, 12, 5);
        tower(-8.6, 6.4, 2.6, 9.5, 4.2);
        tower(8.6, 6.4, 2.6, 9.5, 4.2);
        block(g, -5.9, .5, 6.4, 5.5, 6, 1.6, wallC);
        block(g, 5.9, .5, 6.4, 5.5, 6, 1.6, wallC);
        block(g, 0, 5.2, 6.4, 6.8, 1.6, 1.8, wallC);
        cyl(g, -1.7, .5, 6.4, .5, 4.8, .5, 0xe6d9c6);
        cyl(g, 1.7, .5, 6.4, .5, 4.8, .5, 0xe6d9c6);
        block(g, 0, .5, 6.55, 3.1, 4.4, .5, 0x9a7450);
        for (const wx of [-4.5, 4.5]) addWindow(g, wx, 4.5, 3.6, 1.7, 2.6, 0, true);
        addWindow(g, 0, 8, 3.62, 2.2, 2.6, 0, true);
        flag(g, 0, 19.2, -2, 0x8fd8ee);
        flag(g, -8.6, 17.3, -8, 0xffd587);
        flag(g, 8.6, 17.3, -8, 0xffd587);
        stonePath(g, 0, .06, 8, 0, 16, 5);
        if (L >= 2) { // 粉蓝护城水环 + 拱桥 + 门前火盆 + 灌木球
            for (let i = 0; i < 30; i++) {
                const a = i / 30 * Math.PI * 2;
                if (Math.abs(a - Math.PI / 2) < .34) continue;
                cyl(g, Math.cos(a) * 24, .06, Math.sin(a) * 24, 2.4, .2, 2.2, 0x8fd8ee,
                    { opacity: .78, emissive: 0x2e9cc4, emissiveIntensity: .35, castShadow: false });
            }
            block(g, 0, .18, 24, 4.6, .5, 6.4, 0xe0cfae, { castShadow: false });
            for (const bx of [-5.4, 5.4]) {
                cyl(g, bx, .5, 8.4, .5, 1.4, .5, 0xbfb4a4);
                const ember = orb(g, bx, 2.3, 8.4, .42, 0xffb36a,
                    { emissive: 0xff8a30, emissiveIntensity: 1.8, castShadow: false });
                const emberLight = new THREE.PointLight(0xff9a4d, 1.5, 14, 2);
                emberLight.position.set(bx, 2.8, 8.4); g.add(emberLight);
                animated.push({ type: 'fire', mesh: ember, light: emberLight, seed: bx });
            }
            for (let i = 0; i < 6; i++) {
                const a = i / 6 * Math.PI * 2 + .3;
                orb(g, Math.cos(a) * 19, .7, Math.sin(a) * 19, .8, 0x8fce88, { castShadow: false });
            }
            lampPost(g, -3.4, .2, 12); lampPost(g, 3.4, .2, 12);
        }
        if (L >= 3) { // 鎏金塔尖 + 悬浮王冠光环 + 城心暖光
            for (const [tx, tz, ty] of [[-8.6, -8, 17.4], [8.6, -8, 17.4], [-8.6, 6.4, 14.4], [8.6, 6.4, 14.4]]) {
                orb(g, tx, ty + .4, tz, .42, gold, { emissive: 0xd9a53d, emissiveIntensity: 1, castShadow: false });
            }
            for (let i = 0; i < 8; i++) {
                const a = i / 8 * Math.PI * 2;
                const gem = orb(g, Math.cos(a) * 5.2, 21.6, -2 + Math.sin(a) * 5.2, .42, 0xffe4a0,
                    { emissive: 0xffc23d, emissiveIntensity: 1.6, castShadow: false });
                animated.push({ type: 'crownGem', mesh: gem, angle: a, baseY: 21.6, radius: 5.2, cx: 0, cz: -2 });
            }
            const heart = new THREE.PointLight(0xffd98f, 2.2, 40, 2);
            heart.position.set(0, 12, 0); g.add(heart);
        }
    }


    /* ---------- 「从月壤到盖亚」新物件 ---------- */
    // 静海环形山：凸起的坑缘 + 深色坑底；L2 中央峰，L3 未冷却的陨铁核心
    function makeCrater(g, obj) {
        const L = (obj && obj.level) || 1;
        const rim = 0x878d96, floor = 0x5a5f68;
        for (let i = 0; i < 18; i++) {
            const a = i / 18 * Math.PI * 2;
            block(g, Math.cos(a) * 5.6, 0, Math.sin(a) * 5.6,
                2.2, 1 + hash2(i, 601, seed) * 1.3 * (L >= 2 ? 1.4 : 1), 1.9, rim, { rotationY: -a });
        }
        block(g, 0, -.15, 0, 8.6, .3, 8.6, floor, { castShadow: false });
        for (let i = 0; i < 6; i++) {
            const a = hash2(i, 602, seed) * Math.PI * 2, r = hash2(i, 603, seed) * 3.4;
            block(g, Math.cos(a) * r, .1, Math.sin(a) * r, .8, .5, .7, 0x6d737c, { rotationY: a });
        }
        if (L >= 2) block(g, 0, .1, 0, 1.8, 2.6, 1.8, 0x767d87, { rotationY: .4 });
        if (L >= 3) {
            const core = block(g, 0, 2.7, 0, 1.2, 1.2, 1.2, 0xff9a4d,
                { emissive: 0xff6a1f, emissiveIntensity: 1.6, rotationY: .6 });
            const heat = new THREE.PointLight(0xff8b3d, 1.8, 18, 2);
            heat.position.set(0, 3.6, 0); g.add(heat);
            animated.push({ type: 'fire', mesh: core, light: heat, seed: 3.7 });
        }
    }
    // 月面探测车：六轮车体 + 桅杆；L2 太阳能板与天线，L3 信标闪灯 + 车辙
    function makeRover(g, obj) {
        const L = (obj && obj.level) || 1;
        block(g, 0, 1, 0, 3.4, 1.2, 2.2, 0xd8dde4);
        block(g, 0, 2.2, .3, 1.6, .9, 1.4, 0xaeb6c0);
        for (const wx of [-1.35, 0, 1.35]) for (const wz of [-1.25, 1.25]) {
            block(g, wx, .35, wz, .85, .85, .5, 0x2e343c);
        }
        block(g, 1.2, 2.6, -.4, .18, 1.9, .18, 0x8a919b);
        block(g, 1.2, 4.4, -.4, .7, .5, .1, 0x39424d);
        if (L >= 2) {
            block(g, -.7, 2.9, .2, 2.6, .12, 1.8, 0x2b5f9e, { emissive: 0x1b3f74, emissiveIntensity: .4 });
            block(g, -1.9, 2.4, -.6, .14, 1.5, .14, 0x8a919b);
            block(g, -1.9, 3.9, -.6, .8, .8, .2, 0xe8edf2, { rotationX: .5 });
        }
        if (L >= 3) {
            const beacon = block(g, 1.2, 5, -.4, .34, .34, .34, 0xff5f5f,
                { emissive: 0xff2d2d, emissiveIntensity: 2, castShadow: false });
            const blink = new THREE.PointLight(0xff4d4d, 1.4, 14, 2);
            blink.position.set(1.2, 5.2, -.4); g.add(blink);
            animated.push({ type: 'roverBeacon', mesh: beacon, light: blink });
            for (let i = 0; i < 7; i++) {
                block(g, -2.6 - i * 1.1, .06, -1.25, .8, .1, .4, 0x565c66, { castShadow: false });
                block(g, -2.6 - i * 1.1, .06, 1.25, .8, .1, .4, 0x565c66, { castShadow: false });
            }
        }
    }
    // 盖亚大气机（里程碑）：核心塔 + 旋转环 + 上升气流
    function makeAtmosphere(g) {
        const y = foundation(g, 10, 10, 0, 0x5e6a74);
        block(g, 0, y, 0, 2.6, 9.5, 2.6, 0x9fb3bf);
        block(g, 0, y + 9.5, 0, 3.6, 1, 3.6, 0x74e6ff, { emissive: 0x2bbcd9, emissiveIntensity: 1.1 });
        for (let i = 0; i < 3; i++) {
            const ring = new THREE.Group();
            ring.position.y = y + 3 + i * 2.6;
            for (let k = 0; k < 10; k++) {
                const a = k / 10 * Math.PI * 2;
                block(ring, Math.cos(a) * 3.4, 0, Math.sin(a) * 3.4, .9, .38, .38,
                    0x8ff0ff, { emissive: 0x36c4e0, emissiveIntensity: .8, rotationY: -a, castShadow: false });
            }
            g.add(ring);
            animated.push({ type: 'atmoRing', group: ring, speed: (i % 2 ? -1 : 1) * (.5 + i * .22) });
        }
        for (let i = 0; i < 4; i++) {
            const a = i / 4 * Math.PI * 2 + .4;
            const steam = block(g, Math.cos(a) * 2.4, y + 10.8, Math.sin(a) * 2.4, .7, 4.5, .7,
                0xdff6ff, { opacity: .28, castShadow: false });
            animated.push({ type: 'steam', mesh: steam, baseY: steam.position.y, phase: i * 1.5 });
        }
        const aura = new THREE.PointLight(0x5fd9f2, 2.4, 34, 2);
        aura.position.set(0, y + 10, 0); g.add(aura);
    }
    // 引水彗星核（里程碑）：焦土坑里的巨大冰核，正在融化滴水
    function makeComet(g) {
        for (let i = 0; i < 14; i++) {
            const a = i / 14 * Math.PI * 2;
            block(g, Math.cos(a) * 5, -.1, Math.sin(a) * 5, 2, .9 + (i % 3) * .4, 1.7, 0x9a9288, { rotationY: -a });
        }
        block(g, 0, -.2, 0, 7.6, .3, 7.6, 0x7d766c, { castShadow: false });
        block(g, 0, .4, 0, 3.8, 3.6, 3.4, 0xcfeeff, { opacity: .93, roughness: .18, rotationY: .5,
            emissive: 0x3f7ea6, emissiveIntensity: .25 });
        block(g, 1.1, 2.6, -.6, 2.4, 2.2, 2.1, 0xe8f7ff, { opacity: .9, roughness: .14, rotationY: .9,
            emissive: 0x4f92ba, emissiveIntensity: .3 });
        block(g, -1.4, 2.9, .8, 1.7, 1.6, 1.5, 0xbfe4f7, { opacity: .88, roughness: .2, rotationY: .2 });
        block(g, 0, .05, 0, 5.8, .18, 5.4, 0x3f9fc9, { opacity: .55, emissive: 0x14688f, emissiveIntensity: .4, castShadow: false });
        for (let i = 0; i < 3; i++) {
            const steam = block(g, -1 + i, 4.6, .4 - i * .6, .5, 2.6, .5, 0xe8f7ff, { opacity: .25, castShadow: false });
            animated.push({ type: 'steam', mesh: steam, baseY: steam.position.y, phase: i * 2.1 });
        }
        const chill = new THREE.PointLight(0x8fd4ff, 2, 26, 2);
        chill.position.set(0, 4, 0); g.add(chill);
    }
    // 云雾温泉：石缘水池 + 蒸汽；L2 叠级双池，L3 木栈道与灯笼
    function makeSpring(g, obj) {
        const L = (obj && obj.level) || 1;
        function pool(cx, cz, r, y) {
            for (let i = 0; i < 12; i++) {
                const a = i / 12 * Math.PI * 2;
                block(g, cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, 1.4, .9, 1.1, 0x6d737c, { rotationY: -a });
            }
            block(g, cx, y + .25, cz, r * 1.7, .25, r * 1.7, 0x54d9d0,
                { opacity: .72, emissive: 0x1f8f88, emissiveIntensity: .5, castShadow: false });
            for (let i = 0; i < 3; i++) {
                const steam = block(g, cx + (hash2(i, cz + 640, seed) - .5) * r, y + 1.6,
                    cz + (hash2(i, cx + 641, seed) - .5) * r, .6, 2.8, .6, 0xeef8f8, { opacity: .22, castShadow: false });
                animated.push({ type: 'steam', mesh: steam, baseY: steam.position.y, phase: i * 1.9 + cx });
            }
        }
        pool(0, 0, 3.4, 0);
        if (L >= 2) pool(4.6, 3.4, 2.2, .8);
        if (L >= 3) {
            block(g, -3.6, .15, 3.4, 4.2, .4, 2, 0x8a6a42, { rotationY: .5, castShadow: false });
            addLantern(g, -5, 1.5, 4.4, 0xffc46a);
            block(g, -5, .2, 4.4, .3, 1.4, .3, 0x6b4c2e);
            const warm = new THREE.PointLight(0x6fe0d8, 1.6, 20, 2);
            warm.position.set(0, 3, 0); g.add(warm);
        }
    }
    // 原初生命池（里程碑）：翻着绿泡的原始汤
    function makeSoup(g) {
        const y = foundation(g, 9, 9, 0, 0x4f5a52);
        for (let i = 0; i < 12; i++) {
            const a = i / 12 * Math.PI * 2;
            block(g, Math.cos(a) * 3.6, y - .3, Math.sin(a) * 3.6, 1.5, 1.4, 1.2, 0x9aa39c, { rotationY: -a });
        }
        block(g, 0, y + .2, 0, 6.2, .3, 6.2, 0x5fce6a,
            { opacity: .82, emissive: 0x2b9c3e, emissiveIntensity: .75, castShadow: false });
        block(g, 3.9, y, 0, .8, 4.2, .8, 0x8a919b);
        block(g, 3.9, y + 4.2, 0, 1.4, .8, 1.4, 0x74e6a0, { emissive: 0x2fae5e, emissiveIntensity: 1 });
        block(g, 2.4, y + 1.3, 0, 2.4, .4, .4, 0x8a919b, { rotationZ: .5 });
        for (let i = 0; i < 5; i++) {
            const a = hash2(i, 651, seed) * Math.PI * 2, r = hash2(i, 652, seed) * 2.4;
            const bubble = block(g, Math.cos(a) * r, y + .5, Math.sin(a) * r, .45, .45, .45,
                0x9df2a8, { emissive: 0x4ed468, emissiveIntensity: 1.2, opacity: .85, castShadow: false });
            animated.push({ type: 'soupBubble', mesh: bubble, baseY: bubble.position.y, phase: i * 1.4 });
        }
        const glow = new THREE.PointLight(0x5fe07a, 2.2, 26, 2);
        glow.position.set(0, y + 2.5, 0); g.add(glow);
    }
    // 叠层石群：一层层长高的古老生命；L2 更多石丘，L3 藻光
    function makeStroma(g, obj) {
        const L = (obj && obj.level) || 1;
        block(g, 0, -.05, 0, 8.4, .22, 8.4, 0x3f9fc9, { opacity: .5, emissive: 0x14688f, emissiveIntensity: .3, castShadow: false });
        function mound(cx, cz, sizeK) {
            const layers = 3 + Math.round(sizeK * 2);
            for (let i = 0; i < layers; i++) {
                const w = (2.4 - i * .5) * sizeK;
                if (w <= .3) break;
                block(g, cx, i * .55, cz, w, .55, w * .9,
                    i % 2 ? 0x8a8474 : 0x9c9584, { rotationY: i * .3 });
            }
        }
        mound(0, 0, 1.2); mound(2.6, 1.4, .9); mound(-2.2, -1.6, .8);
        if (L >= 2) { mound(-2.8, 2.2, 1); mound(2.2, -2.4, .75); mound(.4, 3, .6); }
        if (L >= 3) {
            for (let i = 0; i < 6; i++) {
                const a = i / 6 * Math.PI * 2;
                block(g, Math.cos(a) * 3.8, .1, Math.sin(a) * 3.8, .5, .3, .5, 0x74e6a0,
                    { emissive: 0x3dbc66, emissiveIntensity: 1.1, castShadow: false });
            }
            const algae = new THREE.PointLight(0x66d98a, 1.4, 18, 2);
            algae.position.set(0, 2, 0); g.add(algae);
        }
    }
    // 荧光蘑菇林：夜里发光的菌类聚落；L2 更大更多，L3 巨型蘑菇树
    function makeMushroom(g, obj) {
        const L = (obj && obj.level) || 1;
        const caps = [0x64d9e8, 0xb08cff, 0x74e6a0];
        function shroom(cx, cz, k, ci) {
            block(g, cx, 0, cz, .5 * k, 1.7 * k, .5 * k, 0xd8cdb4);
            block(g, cx, 1.6 * k, cz, 1.9 * k, .8 * k, 1.9 * k, caps[ci % 3],
                { emissive: caps[ci % 3], emissiveIntensity: .75 });
            block(g, cx, 1.45 * k, cz, 1.2 * k, .2, 1.2 * k, 0xf2fbff,
                { emissive: 0xbfe9ff, emissiveIntensity: .5, castShadow: false });
        }
        shroom(0, 0, 1.1, 0); shroom(2.2, 1.2, .8, 1); shroom(-1.8, 1.6, .7, 2); shroom(-.6, -2, .9, 1);
        if (L >= 2) { shroom(3, -1.6, 1.2, 2); shroom(-3.2, -.4, 1, 0); shroom(1, 3, .65, 0); }
        if (L >= 3) {
            block(g, 0, 0, 0, 1.4, 6.5, 1.4, 0xe4dbc4);
            block(g, 0, 6.2, 0, 6.4, 2.2, 6.4, 0x8f6fff, { emissive: 0x6f4fe0, emissiveIntensity: .8 });
            block(g, 0, 5.9, 0, 4.2, .3, 4.2, 0xd8ccff, { emissive: 0xb8a6ff, emissiveIntensity: .6, castShadow: false });
            const spore = new THREE.PointLight(0x9d7fff, 2.2, 26, 2);
            spore.position.set(0, 6.5, 0); g.add(spore);
        }
        const fungal = new THREE.PointLight(0x74d9e8, 1.5, 18, 2);
        fungal.position.set(0, 3, 0); g.add(fungal);
    }
    // 万物种子库（里程碑）：绿穹顶的方舟仓库
    function makeSeedVault(g) {
        const y = foundation(g, 14, 12, 0, 0x7c8a6e);
        block(g, 0, y, 0, 11, 4.5, 9, 0xa8b598);
        stepRoof(g, y + 4.5, 12.5, 10.5, 0x4f7a4c, 4, 0);
        block(g, 0, y + 7.9, 0, 3.2, 1, 3.2, 0x74e6a0, { emissive: 0x36b45e, emissiveIntensity: 1 });
        block(g, 0, y + .2, 4.63, 3, 3.4, .4, 0x3c4a3c);
        block(g, 0, y + 2.2, 4.85, 2.2, .8, .2, 0xd7e6a0, { emissive: 0x9fc44e, emissiveIntensity: .6, castShadow: false });
        for (const wx of [-4, 4]) addWindow(g, wx, y + 2.2, 4.55, 1.6, 1.6, 0, false);
        for (let i = 0; i < 6; i++) {
            block(g, -5 + i * 2, y + .1, 6.4, 1.2, .5 + (i % 3) * .3, 1.2, 0x5f8f52, { castShadow: false });
        }
        const lifeGlow = new THREE.PointLight(0x8fe6a0, 2, 26, 2);
        lifeGlow.position.set(0, y + 8.5, 0); g.add(lifeGlow);
    }
    // 生命方舟（里程碑）：搁浅在草原上的巨大方舟
    function makeArk(g) {
        const hull = 0xc08a5a, deck = 0xdca878, dark = 0x9a6f48;
        for (let i = 0; i < 4; i++) {
            block(g, 0, i * 1.6, 0, 24 - i * 2.2, 1.7, 9.5 - i * 1.1, i % 2 ? hull : colorWithLight(hull, .08));
        }
        block(g, 0, 6.4, 0, 20, .7, 7.4, deck);
        block(g, 0, 7.1, 0, 10, 4.2, 6, 0xe8c297);
        stepRoof(g, 11.3, 11.5, 7, dark, 3, 0);
        block(g, -11.4, 2.5, 0, 3.4, 2.6, 5.6, dark, { rotationZ: .35 });
        block(g, 11.6, 3.2, 0, 3.6, 3.4, 5.8, dark, { rotationZ: -.4 });
        addWindow(g, -3.4, 8.9, 3.08, 1.7, 1.7, 0, true);
        addWindow(g, 3.4, 8.9, 3.08, 1.7, 1.7, 0, true);
        block(g, 0, 7.3, 3.05, 2.4, 3, .3, 0x42301d);
        block(g, 6.8, 4.2, 5.4, 4.4, .5, 1.7, deck, { rotationZ: -.45 });
        block(g, 0, 11.6, 0, .4, 5.4, .4, dark);
        flag(g, 0, 12.8, 0, 0x7bed9f);
        addLantern(g, -9, 7.4, 3, 0xffc46a);
        addLantern(g, 9, 7.4, 3, 0xffc46a);
    }
    // 萤火之丘：暮色里飞舞的光点；L2 萤火更盛，L3 萤火古树
    function makeFirefly(g, obj) {
        const L = (obj && obj.level) || 1;
        block(g, 0, -.1, 0, 8, .8, 8, 0x557a4a, { castShadow: false });
        block(g, 0, .5, 0, 5.4, .9, 5.4, 0x5f8a52, { castShadow: false });
        block(g, 0, 1.2, 0, 3, .8, 3, 0x69984f, { castShadow: false });
        block(g, 1.6, 1.9, 1.2, .8, .9, .8, 0xd8cdb4);
        block(g, 1.6, 2.75, 1.2, .6, .35, .6, 0xffe08a, { emissive: 0xffc23d, emissiveIntensity: 1.2, castShadow: false });
        const count = L >= 2 ? 26 : 14;
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            positions[i * 3] = (hash2(i, 671, seed) - .5) * 9;
            positions[i * 3 + 1] = 1.5 + hash2(i, 672, seed) * 4.5;
            positions[i * 3 + 2] = (hash2(i, 673, seed) - .5) * 9;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const points = new THREE.Points(geo, new THREE.PointsMaterial({
            color: 0xd8ff7a, size: .34, transparent: true, opacity: .95,
            blending: THREE.AdditiveBlending, depthWrite: false
        }));
        g.add(points);
        animated.push({ type: 'fireflies', points, phase: hash2(obj.x, obj.z, seed) * 7 });
        if (L >= 3) {
            block(g, -1.8, 1.6, -1.4, 1, 5.4, 1, 0x5c4530);
            block(g, -1.8, 6.6, -1.4, 4.6, 2.2, 4.4, 0x3f6b3c);
            for (let i = 0; i < 5; i++) {
                const a = i / 5 * Math.PI * 2;
                block(g, -1.8 + Math.cos(a) * 1.9, 5.9, -1.4 + Math.sin(a) * 1.8, .3, .9, .3,
                    0xd8ff7a, { emissive: 0xb7e05a, emissiveIntensity: 1.3, castShadow: false });
            }
        }
        const glow = new THREE.PointLight(0xc6e87a, L >= 3 ? 2 : 1.3, 20, 2);
        glow.position.set(0, 3.4, 0); g.add(glow);
    }
    // 星海天文台：银穹顶 + 折射望远镜；L2 鎏金环带，L3 射电碟与观星光束
    function makeObservatory(g, obj) {
        const L = (obj && obj.level) || 1;
        const y = foundation(g, 17, 17, 0, 0x8b93a2);
        for (let i = 0; i < 4; i++) block(g, 0, y + i * 2.1, 0, 12 - i * .8, 2.2, 12 - i * .8, i % 2 ? 0xd5dae2 : 0xc4cad4);
        for (let i = 0; i < 4; i++) {
            const w = 10.5 - i * 2.3;
            block(g, 0, y + 8.4 + i * 1.05, 0, w, 1.1, w, 0xaeb9c9, { roughness: .3, metalness: .45 });
        }
        block(g, 0, y + 8.6, 3.2, 2.2, 3.4, 3.4, 0x2c3442);
        const scope = block(g, 0, y + 10.4, 1.6, 1.4, 5.8, 1.4, 0x39424d, { rotationX: -.7, metalness: .4 });
        block(g, 0, y + .2, 6.13, 2.6, 3.2, .35, 0x222c3a);
        addWindow(g, -4, y + 2.4, 6.08, 1.7, 1.7, 0, false);
        addWindow(g, 4, y + 2.4, 6.08, 1.7, 1.7, 0, false);
        if (L >= 2) {
            block(g, 0, y + 7.9, 0, 12.6, .5, 12.6, 0xd7ad52);
            addLantern(g, -5.4, y + 1.8, 6.2, 0x8fd4ff);
            addLantern(g, 5.4, y + 1.8, 6.2, 0x8fd4ff);
        }
        if (L >= 3) {
            block(g, 7.8, y, 5.4, .8, 4.4, .8, 0x8a919b);
            block(g, 7.8, y + 4.6, 5.4, 3.6, 3.6, .6, 0xe8edf2, { rotationX: .6 });
            block(g, 7.8, y + 4.6, 5.2, .4, 2, .4, 0x39424d, { rotationX: .6 });
            const beam = block(g, 0, y + 13.5, 1.1, .9, 9, .9, 0xbfe2ff,
                { opacity: .3, emissive: 0x5fa8e8, emissiveIntensity: 1, rotationX: -.7, castShadow: false });
            animated.push({ type: 'beam', mesh: beam });
            const star = new THREE.PointLight(0x9cc8ff, 2.2, 30, 2);
            star.position.set(0, y + 13, 0); g.add(star);
        }
    }

    function createWorldObject(raw) {
        const obj = normalizeObject(raw);
        if (!obj) return null;
        const g = new THREE.Group();
        g.userData.worldObject = obj;
        switch (obj.kind) {
            case 'ROCKS': makeRocks(g, obj); break;
            case 'GARDEN': makeGarden(g, obj); break;
            case 'CAMP': makeCamp(g, obj); break;
            case 'FOREST': makeForest(g, obj); break;
            case 'FOUNTAIN': makeFountain(g, obj); break;
            case 'CRYSTAL': makeCrystal(g, obj); break;
            case 'PAVILION': makePavilion(g, obj); break;
            case 'LAKE': makeLake(g, obj); break;
            case 'CABIN': makeCabin(g, obj); break;
            case 'FARM': makeFarm(g, obj); break;
            case 'LIBRARY': makeLibrary(g, obj); break;
            case 'CASTLE': makeCastle(g, obj); break;
            case 'CRATER': makeCrater(g, obj); break;
            case 'ROVER': makeRover(g, obj); break;
            case 'ATMOSPHERE': makeAtmosphere(g); break;
            case 'COMET': makeComet(g); break;
            case 'SPRING': makeSpring(g, obj); break;
            case 'SOUP': makeSoup(g); break;
            case 'STROMA': makeStroma(g, obj); break;
            case 'MUSHROOM': makeMushroom(g, obj); break;
            case 'SEEDVAULT': makeSeedVault(g); break;
            case 'ARK': makeArk(g); break;
            case 'FIREFLY': makeFirefly(g, obj); break;
            case 'OBSERVATORY': makeObservatory(g, obj); break;
            case 'GIFT_TREE': makeSharedTree(g); break;
            case 'GIFT_LANTERN': makeSharedLantern(g); break;
            default: return null;
        }
        g.position.set(obj.x, heightAt(obj.x, obj.z), obj.z);
        // 建筑和森林都可以通过点击识别，而不是只能看。
        g.traverse(child => { child.userData.worldObject = obj; });
        objectRoot.add(g);
        objectGroups.set(String(obj.id), g);
        return g;
    }

    /** 搭档留下的共建物不属于商店目录，但与普通建筑一样永久渲染并可点击看署名。 */
    function makeSharedTree(g) {
        block(g, 0, 2.8, 0, 1.15, 5.6, 1.15, 0x76523a);
        block(g, 0, 6.2, 0, 4.8, 3.8, 4.8, 0x4da875, { rounded: true });
        block(g, -1.9, 8.1, .4, 3.4, 2.9, 3.4, 0x65c888, { rounded: true });
        block(g, 1.8, 8.2, -.3, 3.2, 2.8, 3.2, 0x5abb7d, { rounded: true });
        const light = new THREE.PointLight(0x8fe0ae, 1.1, 18, 2);
        light.position.set(0, 7, 0); g.add(light);
    }
    function makeSharedLantern(g) {
        block(g, 0, 2.5, 0, .55, 5, .55, 0x4d3e38);
        block(g, 0, 5.4, 0, 2.4, .35, 2.4, 0x5d493e);
        block(g, 0, 6.4, 0, 1.85, 2.1, 1.85, 0xffc56c,
            { opacity: .9, emissive: 0xff9d3c, emissiveIntensity: 1.45, rounded: true });
        block(g, 0, 7.6, 0, 2.5, .35, 2.5, 0x5d493e);
        const light = new THREE.PointLight(0xffbd68, 2.1, 24, 2);
        light.position.set(0, 6.4, 0); g.add(light);
    }
    function removeVisualObject(id) {
        const key = String(id);
        const group = objectGroups.get(key);
        if (!group) return false;
        for (let i = animated.length - 1; i >= 0; i--) {
            const ref = animated[i].mesh || animated[i].group || animated[i].points;
            let cursor = ref;
            while (cursor && cursor !== group) cursor = cursor.parent;
            if (cursor === group) animated.splice(i, 1);
        }
        objectRoot.remove(group);
        objectGroups.delete(key);
        return true;
    }
    for (const obj of objectData.values()) createWorldObject(obj);

    /* ---------- programmatic block avatars ---------- */
    const player = {
        position: new THREE.Vector3(0, 0, 11),
        heading: Math.PI,
        velocity: 0,
        group: new THREE.Group(),
        rig: null,
        avatar: {
            style: 'EXPLORER', color: '#57e6d5',
            skinColor: '#E0AD82', hairColor: '#4C3328',
            ...(opts.avatar || {})
        }
    };
    scene.add(player.group);
    let walkTime = 0;
    function colorHex(value, fallback = '#57e6d5') {
        return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback;
    }
    /* ---- 像素小人：程序绘制的 2D 精灵（HD-2D 风），永远面向镜头 ----
     * 精灵图：3 行（正面/侧面/背面）× 3 列（站立/迈左脚/迈右脚），24×34 px/帧，
     * 最近邻放大保持锐利。服装色/肤色/发色沿用形象工坊配置；
     * 大气纪（stage>=1）之前任何职业都会自动戴上玻璃头盔。 */
    const SPRITE_FW = 20, SPRITE_FH = 34, SPRITE_COLS = 3, SPRITE_ROWS = 3;
    function shadeHex(hex, f) {
        const c = new THREE.Color(hex);
        c.lerp(new THREE.Color(f >= 0 ? 0xffffff : 0x000000), Math.abs(f));
        return '#' + c.getHexString();
    }
    function mixHex(hex, target, t) {
        const c = new THREE.Color(hex);
        c.lerp(new THREE.Color(target), t);
        return '#' + c.getHexString();
    }
    /* 星露谷式像素小人：纤细身形、圆润发型剪影、瞳孔高光、三阶配色打光。
     * 3 列（站立/迈左/迈右）× 3 行（正面/侧面/背面），20×34 px/帧。 */
    function drawAvatarSheet(cfg) {
        const canvas = document.createElement('canvas');
        canvas.width = SPRITE_FW * SPRITE_COLS;
        canvas.height = SPRITE_FH * SPRITE_ROWS;
        const ctx = canvas.getContext('2d');
        const astro = cfg.style === 'ASTRONAUT';
        const C = {
            skin: cfg.skin, skinD: shadeHex(cfg.skin, -.22), blush: mixHex(cfg.skin, '#ff8fae', .3),
            hair: cfg.hair, hairD: shadeHex(cfg.hair, -.3), hairS: shadeHex(cfg.hair, .32),
            cloth: astro ? '#eef4f6' : cfg.primary,
            clothD: astro ? '#c2d2da' : shadeHex(cfg.primary, -.28),
            clothL: astro ? '#ffffff' : shadeHex(cfg.primary, .26),
            pants: astro ? '#cdd8de' : mixHex(cfg.primary, '#39466b', .55),
            pantsD: astro ? '#a8b8c2' : mixHex(cfg.primary, '#232c48', .68),
            boots: '#6b4f35', bootsD: '#4a3524',
            hand: astro ? '#d5e0e5' : cfg.skin
        };
        for (let row = 0; row < SPRITE_ROWS; row++) {
            for (let col = 0; col < SPRITE_COLS; col++) {
                drawFrame(col * SPRITE_FW, row * SPRITE_FH, row, col);
            }
        }
        function drawFrame(ox, oy, view, pose) {
            const P = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(ox + x, oy + y, w, h); };
            const G = (x, y, w, h, rgba) => { ctx.fillStyle = rgba; ctx.fillRect(ox + x, oy + y, w, h); };
            /* ============ 腿与靴（先画，被身体压住一部分） ============ */
            if (view === 1) { // 侧面跨步
                const fwd = pose === 1 ? 2 : pose === 2 ? -2 : 0;
                // 后腿
                P(9 - fwd, 23, 3, 6, C.pantsD);
                P(9 - fwd, 29, 3, 3, C.bootsD);
                P(9 - fwd, 31, 4, 1, C.bootsD);
                // 前腿
                P(9 + fwd, 23, 3, 6, C.pants);
                P(9 + fwd, 29, 3, 3, C.boots);
                P(9 + fwd, 31, 4, 1, C.bootsD);
            } else {
                const lUp = pose === 1 ? 1 : 0, rUp = pose === 2 ? 1 : 0;
                // 左腿
                P(6, 23 - lUp, 4, 7, C.pants);
                P(6, 29 - lUp, 4, 3, C.boots);
                P(6, 31 - lUp, 4, 1, C.bootsD);
                // 右腿（略深，区分左右）
                P(10, 23 - rUp, 4, 7, C.pantsD);
                P(10, 29 - rUp, 4, 3, C.boots);
                P(10, 31 - rUp, 4, 1, C.bootsD);
            }
            /* ============ 身体 ============ */
            const bw = view === 1 ? 7 : 8;
            const bx = view === 1 ? 7 : 6;
            P(bx, 14, bw, 8, C.cloth);
            P(bx, 14, bw, 1, C.clothL);                  // 肩头受光
            P(bx + bw - 1, 15, 1, 7, C.clothD);          // 侧影
            P(bx, 21, bw, 1, C.clothD);                  // 下摆
            P(bx, 22, bw, 2, view === 2 ? C.pantsD : C.pants); // 胯
            if (view === 0) {
                P(9, 14, 2, 2, C.clothD);                // 领口
                if (cfg.style === 'ARCHITECT') { P(6, 20, 8, 1, '#e8b93a'); P(9, 20, 2, 1, '#c78f1f'); }
                if (cfg.style === 'EXPLORER') { P(7, 14, 1, 7, '#8a6242'); P(12, 14, 1, 7, '#8a6242'); }
                if (astro) { P(8, 16, 4, 3, cfg.primary); P(9, 17, 2, 1, shadeHex(cfg.primary, .35)); }
            }
            if (view === 2 && cfg.style === 'EXPLORER') { // 背包
                P(6, 15, 8, 6, '#8a6242');
                P(7, 16, 6, 2, '#a37a52');
                P(8, 19, 4, 2, '#6b4a30');
            }
            if (view === 2 && cfg.style === 'RANGER') { // 斗篷
                P(5, 14, 10, 10, C.clothD);
                P(5, 23, 10, 1, C.pantsD);
                P(6, 15, 2, 8, mixHex(C.clothD, '#ffffff', .12));
            }
            /* ============ 手臂 ============ */
            if (view === 1) {
                const sw = pose === 1 ? 2 : pose === 2 ? -2 : 0;
                P(9 + sw, 15, 2, 6, C.clothD);
                P(9 + sw, 21, 2, 2, C.hand);
            } else {
                const lSw = pose === 1 ? 1 : pose === 2 ? -1 : 0;
                const rSw = -lSw;
                P(4, 15 + lSw, 2, 6, view === 2 ? C.clothD : C.cloth);
                P(4, 21 + lSw, 2, 2, C.hand);
                P(14, 15 + rSw, 2, 6, C.clothD);
                P(14, 21 + rSw, 2, 2, C.hand);
            }
            /* ============ 头部（圆润剪影） ============ */
            if (view !== 2) {
                // 脸
                P(6, 5, 8, 8, C.skin);
                P(5, 6, 1, 6, C.skin); P(14, 6, 1, 6, C.skin);   // 圆颊
                P(7, 13, 6, 1, C.skin);                            // 下巴
                P(6, 12, 1, 1, C.skinD); P(13, 12, 1, 1, C.skinD); // 颌影
                // 头发：圆顶 + 刘海 + 鬓发
                P(6, 2, 8, 2, C.hair);
                P(5, 3, 10, 2, C.hair);
                P(4, 4, 12, 2, C.hair);
                P(4, 6, 2, 4, C.hair); P(14, 6, 2, 4, C.hair);     // 鬓角垂发
                P(4, 10, 1, 2, C.hairD); P(15, 10, 1, 2, C.hairD); // 发梢
                P(6, 5, 8, 1, C.hair);                              // 刘海底
                P(7, 5, 1, 1, C.hairD); P(10, 5, 1, 1, C.hairD); P(13, 5, 1, 1, C.hairD); // 发梢锯齿
                P(6, 2, 5, 1, C.hairS);                             // 发丝高光
                P(5, 3, 2, 1, C.hairS);
                if (view === 0) {
                    // 亮晶晶大眼：深瞳列 + 高光列
                    P(7, 8, 1, 2, '#3a2f3f'); P(8, 8, 1, 1, '#ffffff'); P(8, 9, 1, 1, '#6b5a78');
                    P(11, 8, 1, 2, '#3a2f3f'); P(12, 8, 1, 1, '#ffffff'); P(12, 9, 1, 1, '#6b5a78');
                    P(6, 10, 1, 1, C.blush); P(13, 10, 1, 1, C.blush);  // 淡腮红
                    P(9, 11, 2, 1, C.skinD);                            // 小嘴
                } else {
                    // 侧脸：单眼 + 小鼻尖 + 腮红
                    P(11, 8, 1, 2, '#3a2f3f');
                    P(12, 8, 1, 1, '#ffffff'); P(12, 9, 1, 1, '#6b5a78');
                    P(15, 9, 1, 1, C.skinD);
                    P(13, 10, 1, 1, C.blush);
                    P(12, 11, 2, 1, C.skinD);
                    // 侧面头发更包脸
                    P(4, 4, 4, 6, C.hair);
                    P(4, 10, 2, 2, C.hairD);
                }
            } else {
                // 背面：满头头发 + 层次
                P(6, 2, 8, 2, C.hair);
                P(5, 3, 10, 2, C.hair);
                P(4, 4, 12, 8, C.hair);
                P(5, 12, 10, 2, C.hairD);
                P(6, 2, 5, 1, C.hairS);
                P(5, 5, 1, 5, C.hairS);
            }
            /* ============ 职业头饰 ============ */
            if (cfg.style === 'EXPLORER' && !cfg.helmet) {          // 鸭舌帽
                P(5, 2, 10, 2, C.cloth);
                P(4, 3, 12, 2, C.cloth);
                P(5, 2, 6, 1, C.clothL);
                if (view === 0) P(4, 5, 12, 1, C.clothD);
                if (view === 1) { P(12, 5, 6, 1, C.clothD); P(4, 5, 8, 1, C.clothD); }
                if (view === 2) P(4, 5, 12, 1, C.clothD);
            } else if (cfg.style === 'ARCHITECT' && !cfg.helmet) {  // 安全帽
                P(5, 1, 10, 2, '#f3c33d');
                P(4, 3, 12, 2, '#f3c33d');
                P(3, 5, 14, 1, '#d9a521');
                P(6, 1, 4, 1, '#ffe9a3');
            } else if (cfg.style === 'RANGER') {                    // 兜帽
                P(5, 1, 10, 3, C.clothD);
                P(4, 3, 12, 3, C.clothD);
                P(3, 5, 2, 6, C.clothD); P(15, 5, 2, 6, C.clothD);
                P(5, 2, 4, 1, mixHex(C.clothD, '#ffffff', .18));
            }
            /* ============ 玻璃头盔 ============ */
            if (cfg.helmet) {
                const rim = 'rgba(214, 240, 255, .9)';
                G(4, 0, 12, 1, rim); G(4, 13, 12, 1, rim);
                G(3, 1, 1, 12, rim); G(16, 1, 1, 12, rim);
                G(4, 1, 12, 12, 'rgba(158, 216, 255, .22)');
                G(5, 2, 2, 2, 'rgba(255,255,255,.75)');
                G(5, 5, 1, 3, 'rgba(255,255,255,.35)');
            }
        }
        return canvas;
    }
    function createAvatar(avatar) {
        const style = ['EXPLORER', 'ARCHITECT', 'RANGER', 'ASTRONAUT'].includes(String(avatar.style).toUpperCase()) ?
            String(avatar.style).toUpperCase() : 'EXPLORER';
        const primary = colorHex(avatar.color);
        const skin = colorHex(avatar.skinColor, style === 'RANGER' ? '#B87950' : '#E0AD82');
        const hair = colorHex(avatar.hairColor, '#4C3328');
        const helmet = style === 'ASTRONAUT' || stage < 1; // 没有大气就必须戴头盔
        const sheet = drawAvatarSheet({ style, primary, skin, hair, helmet });
        const tex = new THREE.CanvasTexture(sheet);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.repeat.set(1 / SPRITE_COLS, 1 / SPRITE_ROWS);
        const rig = new THREE.Group();
        const H = 5.5, W = H * SPRITE_FW / SPRITE_FH;
        const geo = new THREE.PlaneGeometry(W, H);
        geo.translate(0, H / 2, 0);
        const material = new THREE.MeshLambertMaterial({
            map: tex, transparent: true, alphaTest: .5, side: THREE.DoubleSide,
            emissive: 0x3a3a44, emissiveMap: tex
        });
        const plane = new THREE.Mesh(geo, material);
        plane.castShadow = false;
        plane.receiveShadow = false;
        rig.add(plane);
        // 像素小人不投几何阴影，用贴地圆影代替
        const blob = new THREE.Mesh(new THREE.CircleGeometry(1.05, 18),
            new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .3, depthWrite: false }));
        blob.rotation.x = -Math.PI / 2;
        blob.position.y = .07;
        rig.add(blob);
        rig.userData = { style, sprite: { tex, plane } };
        return rig;
    }
    function updateAvatar(avatar = {}) {
        // readonly 世界初始化时仍需要根据服务端数据构建角色；
        // 挂载完成后则禁止外部 API 在访客视图改变角色。
        if (readonly && player.rig) return { ...player.avatar };
        player.avatar = { ...player.avatar, ...avatar };
        if (player.rig) player.group.remove(player.rig);
        player.rig = createAvatar(player.avatar);
        player.group.add(player.rig);
        return { ...player.avatar };
    }
    updateAvatar(player.avatar);
    player.position.y = playerGroundAt(player.position.x, player.position.z);
    player.group.position.copy(player.position);

    /* ---------- build preview and picking ---------- */
    let buildKind = '';
    const preview = new THREE.Group();
    const previewMaterial = new THREE.MeshStandardMaterial({
        color: 0x66f3db, transparent: true, opacity: .36, emissive: 0x1ed5c8,
        emissiveIntensity: .58, roughness: .38, depthWrite: false
    });
    const previewCube = new THREE.Mesh(cubeGeometry, previewMaterial);
    previewCube.position.y = .16;
    previewCube.scale.set(8, .32, 8);
    previewCube.receiveShadow = false; previewCube.castShadow = false;
    preview.add(previewCube);
    const previewPillar = new THREE.Mesh(cubeGeometry, previewMaterial);
    previewPillar.position.y = 1.5; previewPillar.scale.set(.35, 3, .35);
    preview.add(previewPillar);
    preview.visible = false;
    scene.add(preview);
    let previewPoint = null;
    function setBuildKind(kind) {
        if (readonly) {
            buildKind = '';
            previewPoint = null;
            preview.visible = false;
            renderer.domElement.style.cursor = 'grab';
            return buildKind;
        }
        buildKind = normalizeKind(kind);
        const size = FOOTPRINT[buildKind] || 8;
        previewCube.scale.set(size, .32, size);
        preview.visible = !!buildKind && !!previewPoint;
        renderer.domElement.style.cursor = buildKind ? 'crosshair' : 'grab';
        return buildKind;
    }
    function clearBuildKind() { setBuildKind(null); }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    function setRayFromEvent(e) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
    }
    function pointOnTerrain(e) {
        setRayFromEvent(e);
        // 解析式 ray-march 比逐一检测 16384 个 InstancedMesh 方块更轻；
        // 先粗步进找到与高度场的交叉，再二分得到稳定、准确的落点。
        const origin = raycaster.ray.origin, direction = raycaster.ray.direction;
        let lastT = .1;
        let lastDelta = Infinity;
        for (let t = 1; t <= 520; t += 1.45) {
            const x = origin.x + direction.x * t;
            const y = origin.y + direction.y * t;
            const z = origin.z + direction.z * t;
            const outside = Math.abs(x) > WORLD_HALF || Math.abs(z) > WORLD_HALF;
            if (outside) {
                if (t > 60) break;
                lastT = t; lastDelta = Infinity;
                continue;
            }
            const delta = y - heightAt(x, z);
            if (delta <= .28 && lastDelta > .28) {
                let lo = lastT, hi = t;
                for (let i = 0; i < 7; i++) {
                    const mid = (lo + hi) / 2;
                    const mx = origin.x + direction.x * mid;
                    const my = origin.y + direction.y * mid;
                    const mz = origin.z + direction.z * mid;
                    if (my - heightAt(mx, mz) > .28) lo = mid; else hi = mid;
                }
                const hitT = (lo + hi) / 2;
                // 先返回真实鼠标落点。建造边界由 updatePreview 按当前建筑
                // footprint/服务端半径判定，不应将越界点静默夹到边界内。
                const hx = Math.round((origin.x + direction.x * hitT) * 2) / 2;
                const hz = Math.round((origin.z + direction.z * hitT) * 2) / 2;
                if (Math.abs(hx) > WORLD_HALF || Math.abs(hz) > WORLD_HALF) return null;
                return { x: hx, y: heightAt(hx, hz), z: hz };
            }
            lastT = t; lastDelta = delta;
        }
        return null;
    }
    function updatePreview(e) {
        if (readonly || !buildKind) return;
        const p = pointOnTerrain(e);
        if (!p) {
            previewPoint = null;
            preview.visible = false;
            return;
        }
        previewPoint = p;
        preview.position.set(p.x, p.y + .08, p.z);
        preview.visible = true;
        const centerLimit = placementCenterLimit(buildKind);
        const outOfBounds = Math.abs(p.x) > centerLimit || Math.abs(p.z) > centerLimit;
        const newRadius = placementRadius(buildKind);
        const tooClose = [...objectData.values()].some(obj => {
            const need = newRadius + placementRadius(obj.kind);
            return Math.hypot(obj.x - p.x, obj.z - p.z) < need;
        });
        const invalid = outOfBounds || tooClose;
        previewMaterial.color.setHex(invalid ? 0xff536f : 0x66f3db);
        previewMaterial.emissive.setHex(invalid ? 0xff213f : 0x1ed5c8);
        preview.userData.valid = !invalid;
    }

    /* ---------- keyboard, mouse and touch controls ---------- */
    const keys = Object.create(null);
    const controlKeys = new Set([
        'w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'
    ]);
    const touchMove = new THREE.Vector2();
    let detachJoystick = null;
    let pinchResetTimer = 0;
    function controlKeyOf(e) {
        return String(e && e.key || '').toLowerCase();
    }
    function isEditableTarget(target) {
        const element = target && target.nodeType === 1 ? target : target && target.parentElement;
        return Boolean(element && typeof element.closest === 'function' && element.closest(
            'input,textarea,select,[contenteditable]:not([contenteditable="false"]),' +
            '[role="textbox"],[role="combobox"]'
        ));
    }
    function resetKeyboardState() {
        for (const key of controlKeys) keys[key] = false;
    }
    function keyDown(e) {
        const key = controlKeyOf(e);
        if (!controlKeys.has(key)) return;
        // 输入框、下拉框和 contenteditable 优先消费键盘，不驱动角色。
        if (isEditableTarget(e.target) || isEditableTarget(document.activeElement)
            || e.metaKey || e.ctrlKey || e.altKey) {
            keys[key] = false;
            return;
        }
        keys[key] = true;
        if (document.activeElement === renderer.domElement || key.startsWith('arrow')) e.preventDefault();
    }
    function keyUp(e) {
        const key = controlKeyOf(e);
        // keyup 无论焦点在哪里都要清理，避免从画布切到输入框后“粘键”。
        if (controlKeys.has(key)) keys[key] = false;
    }
    window.addEventListener('keydown', keyDown, { passive: false });
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', resetKeyboardState);

    /** 给触屏设备挂载一个不遮挡世界的虚拟摇杆。 */
    function attachJoystick(joystick) {
        if (detachJoystick) detachJoystick();
        if (!joystick) return () => {};
        const knob = joystick.querySelector('i');
        let activePointer = null;
        const radius = 36;
        function update(e) {
            const rect = joystick.getBoundingClientRect();
            let x = e.clientX - (rect.left + rect.width / 2);
            let y = e.clientY - (rect.top + rect.height / 2);
            const length = Math.hypot(x, y);
            if (length > radius) { x *= radius / length; y *= radius / length; }
            touchMove.set(x / radius, y / radius);
            if (knob) knob.style.transform = `translate(${x}px,${y}px)`;
        }
        function down(e) {
            if (activePointer != null) return;
            activePointer = e.pointerId;
            joystick.classList.add('active');
            try { joystick.setPointerCapture(e.pointerId); } catch (_) { /* Safari fallback */ }
            update(e);
            e.preventDefault();
        }
        function move(e) {
            if (e.pointerId !== activePointer) return;
            update(e);
            e.preventDefault();
        }
        function up(e) {
            if (activePointer != null && e.pointerId !== activePointer) return;
            activePointer = null;
            touchMove.set(0, 0);
            joystick.classList.remove('active');
            if (knob) knob.style.transform = 'translate(0,0)';
        }
        joystick.addEventListener('pointerdown', down, { passive: false });
        joystick.addEventListener('pointermove', move, { passive: false });
        joystick.addEventListener('pointerup', up);
        joystick.addEventListener('pointercancel', up);
        detachJoystick = () => {
            joystick.removeEventListener('pointerdown', down);
            joystick.removeEventListener('pointermove', move);
            joystick.removeEventListener('pointerup', up);
            joystick.removeEventListener('pointercancel', up);
            up({ pointerId: activePointer });
            detachJoystick = null;
        };
        return detachJoystick;
    }

    let camYaw = Math.PI * .82;
    let camPitch = .48;
    let camDistance = 17;
    let pinchDistance = 0;
    let pinching = false;
    // pinch 结束后保持到下一次完整 touch 序列开始，防止剩余手指续上单指旋转。
    let pinchSequenceActive = false;
    const activeTouchPointers = new Set();
    let cameraNudge = 0;
    let dragging = false;
    let pointerId = null;
    let lastX = 0, lastY = 0, downX = 0, downY = 0, moved = 0;
    const dom = renderer.domElement;
    function cancelPointerDrag() {
        const capturedPointer = pointerId;
        dragging = false;
        pointerId = null;
        moved = Number.POSITIVE_INFINITY;
        dom.style.cursor = buildKind ? 'crosshair' : 'grab';
        if (capturedPointer != null && typeof dom.releasePointerCapture === 'function') {
            try {
                if (!dom.hasPointerCapture || dom.hasPointerCapture(capturedPointer)) {
                    dom.releasePointerCapture(capturedPointer);
                }
            } catch (_) { /* Safari 可能已自动释放 */ }
        }
    }
    function pointerDown(e) {
        if (e.button != null && e.button !== 0 && e.button !== 2) return;
        if (rayHitsInterface(e)) return;
        if (e.pointerType === 'touch') {
            activeTouchPointers.add(e.pointerId);
            if (activeTouchPointers.size >= 2) {
                pinching = true;
                pinchSequenceActive = true;
                cancelPointerDrag();
                return;
            }
        }
        // 第二根手指交给双指缩放，不覆盖第一根手指的旋转指针。
        if (e.pointerType === 'touch' && (pinching || pinchSequenceActive || dragging)) return;
        dragging = true; pointerId = e.pointerId;
        lastX = downX = e.clientX; lastY = downY = e.clientY; moved = 0;
        dom.style.cursor = buildKind ? 'crosshair' : 'grabbing';
        try { dom.setPointerCapture(e.pointerId); } catch (_) { /* Safari fallback */ }
        dom.focus({ preventScroll: true });
    }
    function uiAtPoint(e) {
        if (typeof document.elementFromPoint !== 'function') return false;
        const root = dom.parentElement;
        let target = document.elementFromPoint(e.clientX, e.clientY);
        while (target && target !== root && target !== dom) {
            if (target.matches && target.matches('button,input,select,textarea,label,.world-builder,.avatar-studio,.world-toolbar,.mobile-joystick,.liftoff-btn,.visit-msg-bar,.world-hint,.place-bar,.gesture-console')) {
                return true;
            }
            target = target.parentElement;
        }
        return false;
    }
    function pointerMove(e) {
        if (e.pointerType === 'touch' && (pinching || pinchSequenceActive)) return;
        if (uiAtPoint(e)) return;
        if (buildKind) updatePreview(e);
        if (!dragging || (pointerId != null && e.pointerId !== pointerId)) return;
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        moved += Math.abs(dx) + Math.abs(dy);
        if (moved > 3) {
            camYaw -= dx * .0052;
            camPitch = clamp(camPitch + dy * .0039, .12, 1.2);
        }
        lastX = e.clientX; lastY = e.clientY;
    }
    function pickedWorldObject(e) {
        setRayFromEvent(e);
        const hits = raycaster.intersectObjects(objectRoot.children, true);
        for (const hit of hits) {
            if (hit.object.userData.worldObject) return hit.object.userData.worldObject;
        }
        return null;
    }
    const rayHitsInterface = uiAtPoint;
    function pointerUp(e) {
        if (e.pointerType === 'touch' && pinchSequenceActive) {
            activeTouchPointers.delete(e.pointerId);
            if (pointerId === e.pointerId) cancelPointerDrag();
            return;
        }
        if (e.pointerType === 'touch') activeTouchPointers.delete(e.pointerId);
        if (!dragging || (pointerId != null && e.pointerId !== pointerId)) return;
        const isClick = moved < 7 && Math.hypot(e.clientX - downX, e.clientY - downY) < 7;
        dragging = false; pointerId = null;
        dom.style.cursor = buildKind ? 'crosshair' : 'grab';
        if (!isClick) return;
        if (rayHitsInterface(e)) return;
        if (buildKind) {
            updatePreview(e);
            if (!readonly && previewPoint && preview.userData.valid !== false
                && typeof opts.onGroundClick === 'function') {
                opts.onGroundClick({ x: previewPoint.x, z: previewPoint.z, kind: buildKind });
            }
            return;
        }
        const obj = pickedWorldObject(e);
        // readonly 世界允许查看建筑信息，但不将可变的内部对象暴露给回调。
        if (obj && typeof opts.onObjectClick === 'function') {
            opts.onObjectClick(readonly ? { ...obj } : obj);
            return;
        }
        const p = pointOnTerrain(e);
        if (!readonly && p && typeof opts.onGroundClick === 'function') {
            opts.onGroundClick({ x: p.x, z: p.z });
        }
    }
    function pointerCancel(e) {
        if (e && e.pointerType === 'touch') activeTouchPointers.delete(e.pointerId);
        cancelPointerDrag();
    }
    function wheel(e) {
        e.preventDefault();
        camDistance = clamp(camDistance + e.deltaY * .015, 6.5, 34);
    }
    function touchDistance(e) {
        if (e.touches.length < 2) return 0;
        return Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY);
    }
    function touchStart(e) {
        if (e.touches.length >= 2) {
            if (pinchResetTimer) {
                window.clearTimeout(pinchResetTimer);
                pinchResetTimer = 0;
            }
            pinching = true;
            pinchSequenceActive = true;
            pinchDistance = touchDistance(e);
            // 取消单指 pointer 旋转，从这一帧开始只处理 pinch。
            cancelPointerDrag();
        }
    }
    function touchMoveCamera(e) {
        if (e.touches.length < 2) return;
        pinching = true;
        pinchSequenceActive = true;
        const next = touchDistance(e);
        if (pinchDistance) camDistance = clamp(camDistance + (pinchDistance - next) * .035, 6.5, 34);
        pinchDistance = next;
        e.preventDefault();
    }
    function touchEnd(e) {
        if (e.touches.length < 2) {
            pinching = false;
            pinchDistance = 0;
        }
        if (e.touches.length === 0) activeTouchPointers.clear();
        // pinch 后剩下的手指不继续旋转/点击，必须全部抬起再开始新手势。
        if (e.touches.length === 0 && pinchSequenceActive) {
            cancelPointerDrag();
            // touchend 先于同一序列最后的 pointerup，延后清理才能屏蔽那次 pointerup。
            pinchResetTimer = window.setTimeout(() => {
                pinchSequenceActive = false;
                activeTouchPointers.clear();
                pinchResetTimer = 0;
            }, 0);
        }
    }
    function contextMenu(e) { e.preventDefault(); }
    dom.addEventListener('pointerdown', pointerDown);
    dom.addEventListener('pointermove', pointerMove);
    dom.addEventListener('pointerup', pointerUp);
    dom.addEventListener('pointercancel', pointerCancel);
    dom.addEventListener('wheel', wheel, { passive: false });
    dom.addEventListener('touchstart', touchStart, { passive: true });
    dom.addEventListener('touchmove', touchMoveCamera, { passive: false });
    dom.addEventListener('touchend', touchEnd);
    dom.addEventListener('touchcancel', touchEnd);
    dom.addEventListener('contextmenu', contextMenu);

    /* ---------- animation loop ---------- */
    const clock = new THREE.Clock();
    let elapsed = 0;
    const cameraTarget = new THREE.Vector3();
    const desiredCamera = new THREE.Vector3();
    const moveVector = new THREE.Vector3();
    const upAxis = new THREE.Vector3(0, 1, 0);
    function shortestAngle(current, target) {
        return Math.atan2(Math.sin(target - current), Math.cos(target - current));
    }
    function animatePlayer(dt) {
        let forward = 0, side = 0;
        if (keys.w || keys.arrowup) forward += 1;
        if (keys.s || keys.arrowdown) forward -= 1;
        if (keys.a || keys.arrowleft) side -= 1;
        if (keys.d || keys.arrowright) side += 1;
        // 摇杆向上为前进，向右为右移；键盘与摇杆可以自然叠加。
        side += touchMove.x;
        forward -= touchMove.y;
        moveVector.set(side, 0, -forward);
        const moving = moveVector.lengthSq() > 0;
        const targetSpeed = moving ? (keys.shift ? 13.5 : 7.1) : 0;
        player.velocity = THREE.MathUtils.damp(player.velocity, targetSpeed, moving ? 8 : 11, dt);
        if (moving) {
            moveVector.normalize().applyAxisAngle(upAxis, camYaw);
            const targetHeading = Math.atan2(moveVector.x, moveVector.z);
            player.heading += shortestAngle(player.heading, targetHeading) * Math.min(1, dt * 11);
            const nextX = clamp(player.position.x + moveVector.x * player.velocity * dt, -WORLD_HALF + 6, WORLD_HALF - 6);
            const nextZ = clamp(player.position.z + moveVector.z * player.velocity * dt, -WORLD_HALF + 6, WORLD_HALF - 6);
            const nextGround = playerGroundAt(nextX, nextZ);
            const currentGround = playerGroundAt(player.position.x, player.position.z);
            // 可越过一个方块高差，山坡仍然可探索；过陡则沿另一轴滑动。
            if (nextGround - currentGround < 2.35 && !obstacleAt(nextX, nextZ)) {
                player.position.x = nextX; player.position.z = nextZ;
            } else {
                const xGround = playerGroundAt(nextX, player.position.z);
                const zGround = playerGroundAt(player.position.x, nextZ);
                if (xGround - currentGround < 2.35 && !obstacleAt(nextX, player.position.z)) player.position.x = nextX;
                else if (zGround - currentGround < 2.35 && !obstacleAt(player.position.x, nextZ)) player.position.z = nextZ;
            }
        }
        player.position.y = THREE.MathUtils.damp(player.position.y,
            playerGroundAt(player.position.x, player.position.z), 14, dt);
        player.group.position.copy(player.position);
        // 像素精灵：朝向由帧图表现，组本身不旋转
        player.group.rotation.y = 0;
        if (player.rig && player.rig.userData.sprite) {
            const sp = player.rig.userData.sprite;
            // 仅绕 Y 轴的公告牌：始终面向镜头
            const yaw = Math.atan2(camera.position.x - player.position.x,
                camera.position.z - player.position.z);
            sp.plane.rotation.y = yaw;
            // 角色朝向相对镜头方向 → 选择 正/侧/背 行
            const rel = shortestAngle(player.heading, yaw);
            const a = Math.abs(rel);
            let row, mirror = false;
            if (a < Math.PI * .32) { row = 0; }                    // 朝镜头走：正面
            else if (a > Math.PI * .68) { row = 2; }               // 背对镜头：背面
            else { row = 1; mirror = rel > 0; }                    // 横向：侧面（必要时镜像）
            if (moving) walkTime += dt * (keys.shift ? 10.5 : 7); else walkTime = 0;
            const col = moving ? [1, 0, 2, 0][Math.floor(walkTime) % 4] : 0;
            sp.tex.repeat.x = (mirror ? -1 : 1) / SPRITE_COLS;
            sp.tex.offset.x = (mirror ? col + 1 : col) / SPRITE_COLS;
            sp.tex.offset.y = 1 - (row + 1) / SPRITE_ROWS;
            // 走路小跳 + 待机呼吸
            sp.plane.position.y = moving ? Math.abs(Math.sin(walkTime * Math.PI)) * .22
                : Math.sin(elapsed * 2.1) * .05;
            sp.plane.scale.y = moving ? 1 : 1 + Math.sin(elapsed * 2.1) * .012;
        }
    }
    function animateWorld(dt) {
        clouds.forEach((cloud, i) => {
            cloud.group.position.x += cloud.speed * dt;
            if (cloud.group.position.x > 235) cloud.group.position.x = -235;
            cloud.group.position.y += Math.sin(elapsed * .16 + i) * dt * .06;
        });
        stars.material.opacity = Math.max(0, starsBaseOpacity + Math.sin(elapsed * .5) * .06);
        tickEnvTransition(dt);
        tickRain(dt);
        animateLife(dt);
        for (let i = growingTrees.length - 1; i >= 0; i--) {
            const grow = growingTrees[i];
            if ((grow.delay -= dt) > 0) continue;
            grow.t += dt;
            const k = Math.min(1, grow.t / .9);
            grow.group.scale.setScalar(Math.max(.02, 1 - Math.pow(1 - k, 3)));
            if (k >= 1) growingTrees.splice(i, 1);
        }
        naturalWater.position.y = naturalLake.surface + .05 + Math.sin(elapsed * .72) * .035;
        naturalWater.material.opacity = .68 + Math.sin(elapsed * .58) * .035;
        for (const item of animated) {
            if (item.type === 'fire') {
                const pulse = 1 + Math.sin(elapsed * 13 + item.seed) * .14;
                item.mesh.scale.y = pulse;
                item.light.intensity = 2.15 + Math.sin(elapsed * 9 + item.seed) * .35;
            } else if (item.type === 'waterJet') {
                item.mesh.scale.y = 1 + Math.sin(elapsed * 3.4) * .08;
                item.light.intensity = 1.55 + Math.sin(elapsed * 2.1) * .28;
            } else if (item.type === 'crystal') {
                item.light.intensity = 2.4 + Math.sin(elapsed * 2.3 + item.seed) * .55;
            } else if (item.type === 'lake') {
                item.mesh.position.y = item.baseY + Math.sin(elapsed * .8 + item.seed) * .045;
                item.mesh.material.opacity = .72 + Math.sin(elapsed * .65 + item.seed) * .04;
            } else if (item.type === 'windmill') {
                item.group.rotation.z -= dt * .55;
            } else if (item.type === 'castleCore') {
                item.mesh.position.y = item.baseY + Math.sin(elapsed * 1.4) * .65;
                item.mesh.rotation.y += dt * .75;
                item.mesh.rotation.x += dt * .25;
                item.light.position.y = item.mesh.position.y;
            } else if (item.type === 'crownGem') {
                const a = item.angle + elapsed * (item.speed || .8);
                const R = item.radius || 5.4;
                item.mesh.position.x = (item.cx || 0) + Math.cos(a) * R;
                item.mesh.position.z = (item.cz != null ? item.cz : -1) + Math.sin(a) * R;
                item.mesh.position.y = item.baseY + Math.sin(elapsed * 2 + item.angle) * .5;
            } else if (item.type === 'atmoRing') {
                item.group.rotation.y += dt * item.speed;
            } else if (item.type === 'steam') {
                const cycle = (elapsed * .55 + item.phase) % 2;
                item.mesh.position.y = item.baseY + cycle * 3.2;
                item.mesh.material.opacity = Math.max(0, .3 - cycle * .14);
            } else if (item.type === 'soupBubble') {
                const cycle = (elapsed * .9 + item.phase) % 1.6;
                item.mesh.position.y = item.baseY + cycle * 1.4;
                item.mesh.scale.setScalar(Math.max(.15, 1 - cycle * .55));
            } else if (item.type === 'roverBeacon') {
                const on = Math.sin(elapsed * 5) > 0;
                item.light.intensity = on ? 1.6 : .1;
                item.mesh.material.emissiveIntensity = on ? 2.2 : .3;
            } else if (item.type === 'fireflies') {
                item.points.rotation.y = Math.sin(elapsed * .4 + item.phase) * .6;
                item.points.position.y = Math.sin(elapsed * .8 + item.phase) * .5;
                item.points.material.opacity = .65 + Math.sin(elapsed * 2.2 + item.phase) * .3;
            } else if (item.type === 'beam') {
                item.mesh.material.opacity = .2 + Math.sin(elapsed * 1.6) * .12;
            } else if (item.type === 'smoke') {
                const cycle = (elapsed * .5 + item.phase) % 2.4;
                const k = cycle / 2.4;
                item.mesh.position.y = item.baseY + cycle * 2.1;
                item.mesh.material.opacity = .32 * (1 - k);
                item.mesh.scale.setScalar(item.baseS * (1 + k * 1.7));
            }
        }
    }
    function animateCamera(dt) {
        camYaw += cameraNudge * dt;
        cameraNudge = THREE.MathUtils.damp(cameraNudge, 0, 3.6, dt);
        cameraTarget.set(player.position.x, player.position.y + 3.05, player.position.z);
        desiredCamera.set(
            cameraTarget.x + Math.sin(camYaw) * Math.cos(camPitch) * camDistance,
            cameraTarget.y + Math.sin(camPitch) * camDistance,
            cameraTarget.z + Math.cos(camYaw) * Math.cos(camPitch) * camDistance
        );
        const cameraGround = heightAt(desiredCamera.x, desiredCamera.z) + 1;
        if (desiredCamera.y < cameraGround) desiredCamera.y = cameraGround;
        camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * 8));
        camera.lookAt(cameraTarget);
        sun.position.set(player.position.x - 90, 145, player.position.z - 75);
        sun.target.position.copy(player.position);
    }
    function loop() {
        if (destroyed) return;
        frameId = requestAnimationFrame(loop);
        const dt = Math.min(.05, clock.getDelta());
        elapsed += dt;
        animatePlayer(dt);
        animateWorld(dt);
        animateCamera(dt);
        if (composer) composer.render();
        else renderer.render(scene, camera);
    }
    animateCamera(1);
    loop();

    /* ---------- public API ---------- */
    function upsertObject(raw) {
        if (readonly) return null;
        const obj = normalizeObject(raw, objectData.size);
        if (!obj) return null;
        const key = String(obj.id);
        const previous = objectData.get(key);
        if (previous) {
            const previousTerrain = previous.kind === 'LAKE' || FLATTEN_BUILD_KINDS.has(previous.kind);
            removeVisualObject(key);
            objectData.set(key, obj);
            const nextStage = visibleEpoch(objectData.values());
            if (nextStage !== stage) { applyStage(nextStage); return { ...obj }; }
            refreshTerrainModifiers();
            if (previousTerrain || obj.kind === 'LAKE' || FLATTEN_BUILD_KINDS.has(obj.kind)) {
                // 已放置物件如果移动/换类型，整批重建，保证所有建筑仍贴在新地形上。
                rebuildTerrain();
                for (const id of [...objectGroups.keys()]) removeVisualObject(id);
                for (const data of objectData.values()) createWorldObject(data);
                refreshNatureVisibility();
                return { ...obj };
            }
        }
        objectData.set(key, obj);
        const nextStage = visibleEpoch(objectData.values());
        if (nextStage !== stage) {
            // 里程碑落成：天空变色 / 降雨 / 苔藓蔓延 / 森林生长 / 生灵到来
            applyStage(nextStage);
            return { ...obj };
        }
        refreshTerrainModifiers();
        refreshNatureVisibility();
        const terrainChanging = obj.kind === 'LAKE' || FLATTEN_BUILD_KINDS.has(obj.kind);
        if (terrainChanging) {
            rebuildTerrain();
            // 新地形可能影响相邻物件的 Y 坐标，整批重建比留下悬空模型更可靠。
            for (const remainingId of [...objectGroups.keys()]) removeVisualObject(remainingId);
            for (const data of objectData.values()) createWorldObject(data);
            return { ...obj };
        }
        const group = createWorldObject(obj);
        return group ? { ...obj } : null;
    }
    function removeObject(id) {
        if (readonly) return false;
        const key = String(id);
        const obj = objectData.get(key);
        if (!obj) return false;
        removeVisualObject(key);
        objectData.delete(key);
        const nextStage = visibleEpoch(objectData.values());
        if (nextStage !== stage) { applyStage(nextStage, { animate: false }); return true; }
        refreshTerrainModifiers();
        refreshNatureVisibility();
        if (obj.kind === 'LAKE' || FLATTEN_BUILD_KINDS.has(obj.kind)) {
            rebuildTerrain();
            // 湖泊/地基会改变高度场，删除后重新贴合剩余建筑。
            for (const remainingId of [...objectGroups.keys()]) removeVisualObject(remainingId);
            for (const data of objectData.values()) createWorldObject(data);
        }
        return true;
    }
    function nudgeCamera(dx) {
        const amount = Number(dx) || 0;
        // 手势模块传入的是标准化位移（约 -0.25..0.25），放大为明显但平滑的惯性；
        // 若外部传入像素位移，则沿用像素换算。
        cameraNudge += Math.abs(amount) <= 1 ? amount * -4.2 : amount * -.006;
        return camYaw;
    }
    function destroy() {
        if (destroyed) return;
        destroyed = true;
        cancelAnimationFrame(frameId);
        window.removeEventListener('resize', resize);
        window.removeEventListener('keydown', keyDown);
        window.removeEventListener('keyup', keyUp);
        window.removeEventListener('blur', resetKeyboardState);
        if (pinchResetTimer) window.clearTimeout(pinchResetTimer);
        activeTouchPointers.clear();
        if (detachJoystick) detachJoystick();
        if (resizeObserver) resizeObserver.disconnect();
        dom.removeEventListener('pointerdown', pointerDown);
        dom.removeEventListener('pointermove', pointerMove);
        dom.removeEventListener('pointerup', pointerUp);
        dom.removeEventListener('pointercancel', pointerCancel);
        dom.removeEventListener('wheel', wheel);
        dom.removeEventListener('touchstart', touchStart);
        dom.removeEventListener('touchmove', touchMoveCamera);
        dom.removeEventListener('touchend', touchEnd);
        dom.removeEventListener('touchcancel', touchEnd);
        dom.removeEventListener('contextmenu', contextMenu);
        scene.traverse(object => {
            if (object.geometry && object.geometry !== cubeGeometry) object.geometry.dispose();
            if (object.material && ![...materialCache.values()].includes(object.material)) {
                const materials = Array.isArray(object.material) ? object.material : [object.material];
                materials.forEach(m => m.dispose && m.dispose());
            }
        });
        cubeGeometry.dispose();
        roundedUnit.dispose(); sphereUnit.dispose(); cylUnit.dispose();
        materialCache.forEach(m => m.dispose());
        terrainMat.dispose(); previewMaterial.dispose();
        if (composer) composer.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        dom.remove();
        if (!oldPosition) el.style.removeProperty('position');
        else el.style.position = oldPosition;
    }

    function setObjects(objects = []) {
        if (readonly) return objectData.size;
        for (const id of [...objectGroups.keys()]) removeVisualObject(id);
        objectData.clear();
        objects.forEach((raw, i) => {
            const obj = normalizeObject(raw, i);
            if (obj) objectData.set(String(obj.id), obj);
        });
        const nextStage = visibleEpoch(objectData.values());
        if (nextStage !== stage) { applyStage(nextStage, { animate: false }); return objectData.size; }
        refreshTerrainModifiers();
        rebuildTerrain();
        refreshNatureVisibility();
        for (const obj of objectData.values()) createWorldObject(obj);
        return objectData.size;
    }

    const handle = {
        destroy,
        // 当前约定和兼容别名同时保留，便于 app.js 或手势模块调用。
        setBuildKind,
        setBuildMode: setBuildKind,
        clearBuildKind,
        clearBuildMode: clearBuildKind,
        updateAvatar,
        setAvatar: updateAvatar,
        nudgeCamera,
        rotateBy: nudgeCamera,
        // 访客仍可用摇杆漫游；readonly 只限制建造/拆除/换装等世界写操作。
        attachJoystick,
        playerPos: () => player.position.clone(),
        upsertObject,
        removeObject,
        setObjects,
        heightAt,
        // 调试/扩展用只读句柄；正常业务无需直接访问。
        // readonly 访客不暴露可直接修改场景树的调试句柄。
        scene: readonly ? undefined : scene,
        camera: readonly ? undefined : camera,
        THREE
    };
    // 角色与地形已经同步构造完成，不依赖异步外部 GLB。
    if (typeof opts.onReady === 'function') queueMicrotask(() => {
        if (!destroyed) opts.onReady(handle);
    });
    return handle;
}

window.World3D = { mount };
