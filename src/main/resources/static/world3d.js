// ===== World3D：高品质 Minecraft 风格可建造星球 =====
// 该文件不依赖模型或贴图：地形、角色、建筑、森林与湖泊均由方块程序化生成。
// 公共入口：window.World3D.mount(element, options)
import * as THREE from 'three';

const WORLD_HALF = 192;
const WORLD_SIZE = WORLD_HALF * 2;
const CELL = 3;
const CELLS = Math.floor(WORLD_SIZE / CELL);
const BASE_Y = -12;
const BUILD_KINDS = new Set([
    'ROCKS', 'GARDEN', 'CAMP', 'FOREST', 'FOUNTAIN', 'CRYSTAL',
    'PAVILION', 'LAKE', 'CABIN', 'FARM', 'LIBRARY', 'CASTLE'
]);
const FOOTPRINT = {
    ROCKS: 8, GARDEN: 11, CAMP: 11, FOREST: 22, FOUNTAIN: 12, CRYSTAL: 9,
    PAVILION: 15, LAKE: 25, CABIN: 17, FARM: 28, LIBRARY: 32, CASTLE: 44
};
// 与 PlanetService.placementRadius 保持一致：服务端按两个占地圆半径之和判重，
// 前端预览也使用同一套半径，避免“预览可放、提交却失败”。
const PLACEMENT_RADIUS = {
    CASTLE: 22,
    LIBRARY: 18,
    FARM: 15,
    LAKE: 15,
    FOREST: 13,
    CABIN: 8,
    PAVILION: 8,
    FOUNTAIN: 8,
    CAMP: 8,
    GARDEN: 8,
    ROCKS: 6,
    CRYSTAL: 6
};
const BUILD_WORLD_LIMIT = 190;
const TITLES = {
    ROCKS: '岩石群', GARDEN: '繁花花园', CAMP: '星空营地', FOREST: '橡木森林',
    FOUNTAIN: '星辉喷泉', CRYSTAL: '能量水晶', PAVILION: '东方凉亭',
    LAKE: '蓝晶湖泊', CABIN: '林间木屋', FARM: '自动农场',
    LIBRARY: '知识图书馆', CASTLE: '云顶城堡'
};
const FLATTEN_BUILD_KINDS = new Set([
    'GARDEN', 'CAMP', 'FOUNTAIN', 'CRYSTAL', 'PAVILION', 'CABIN', 'FARM', 'LIBRARY', 'CASTLE'
]);

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
    return { ...raw, id, kind, title: raw.title || TITLES[kind], x, z };
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

    function resize() {
        const width = Math.max(1, el.clientWidth || window.innerWidth);
        const height = Math.max(1, el.clientHeight || window.innerHeight);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setPixelRatio(Math.min(pixelRatioCap, window.devicePixelRatio || 1));
        renderer.setSize(width, height, false);
    }
    resize();
    window.addEventListener('resize', resize);
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (resizeObserver) resizeObserver.observe(el);

    /* ---------- material / voxel helpers ---------- */
    const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
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
        const mesh = new THREE.Mesh(cubeGeometry, settings.material || mat(color, settings));
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
    function addLantern(parent, x, y, z, color = 0xffb33b) {
        block(parent, x, y, z, .65, .8, .65, color, {
            emissive: color, emissiveIntensity: 1.7, castShadow: false
        });
    }

    /* ---------- dramatic voxel sky ---------- */
    const skyUniforms = {
        topColor: { value: new THREE.Color(isDesert ? 0x33405a : isGloomy ? 0x101a31 : 0x125e87) },
        horizonColor: { value: new THREE.Color(isDesert ? 0xd89d69 : isGloomy ? 0x53617b : 0x76c7d9) },
        bottomColor: { value: new THREE.Color(isDesert ? 0x8b6b4a : 0x0a1b2c) }
    };
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
    const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({
        color: 0xd9edff, size: 1.65, transparent: true, opacity: isGloomy ? .45 : .72,
        sizeAttenuation: false, depthWrite: false
    }));
    scene.add(stars);

    // 远处方块山脉强化世界纵深，不增加近景碰撞/建造负担。
    const skyline = new THREE.Group();
    const mountainMats = [mat(0x334b58), mat(0x405c63), mat(isDesert ? 0x7f684c : 0x2d4651)];
    for (let i = 0; i < 24; i++) {
        const a = i / 24 * Math.PI * 2 + hash2(i, 5, seed) * .12;
        const radius = 230 + hash2(i, 6, seed) * 32;
        const height = 28 + hash2(i, 7, seed) * 48;
        const width = 24 + hash2(i, 8, seed) * 35;
        const mountain = new THREE.Mesh(cubeGeometry, mountainMats[i % mountainMats.length]);
        mountain.scale.set(width, height, width * .7);
        mountain.position.set(Math.cos(a) * radius, BASE_Y + height / 2,
            Math.sin(a) * radius);
        mountain.rotation.y = -a + hash2(i, 10, seed) * .3;
        mountain.castShadow = false; mountain.receiveShadow = false;
        skyline.add(mountain);
        if (height > 52 && !isDesert) {
            const snow = new THREE.Mesh(cubeGeometry, mat(0xd9e2df));
            snow.scale.set(width * .62, height * .15, width * .45);
            snow.position.set(mountain.position.x, BASE_Y + height * .93, mountain.position.z);
            snow.rotation.y = mountain.rotation.y;
            skyline.add(snow);
        }
    }
    scene.add(skyline);

    const sunOrb = new THREE.Mesh(new THREE.BoxGeometry(16, 16, 3), mat(0xffeb9a, {
        basic: true, emissive: 0xffd56a, emissiveIntensity: 2
    }));
    sunOrb.position.set(-155, 105, -245);
    sunOrb.rotation.y = -.55;
    scene.add(sunOrb);

    const sun = new THREE.DirectionalLight(isGloomy ? 0xb8c9ea : 0xffe5bb, isGloomy ? 1.25 : 2.5);
    sun.position.set(-90, 145, -75);
    sun.castShadow = true;
    sun.shadow.mapSize.set(mobileQuality ? 1024 : 1536, mobileQuality ? 1024 : 1536);
    Object.assign(sun.shadow.camera, { left: -95, right: 95, top: 95, bottom: -95, near: 10, far: 360 });
    sun.shadow.bias = -.00035;
    scene.add(sun);
    // DirectionalLight.target 必须在场景树中，但只需添加一次。
    scene.add(sun.target);
    const hemi = new THREE.HemisphereLight(isDesert ? 0xffd6a0 : 0x9ad9ff, isDesert ? 0x6c4a28 : 0x203d2c,
        isGloomy ? .78 : 1.32);
    scene.add(hemi);
    scene.add(new THREE.AmbientLight(0x20304e, .18));

    const clouds = [];
    for (let i = 0; i < 12; i++) {
        const cloud = new THREE.Group();
        const cloudColor = isGloomy ? 0x68758b : 0xe7f4fb;
        const parts = 4 + Math.floor(hash2(i, 4, seed) * 4);
        for (let p = 0; p < parts; p++) {
            block(cloud, (p - parts / 2) * 4.4, Math.sin(p) * 1.3, (p % 2) * 2.3,
                7.5, 3.2 + (p % 3), 5.2, cloudColor, { opacity: isGloomy ? .65 : .48, castShadow: false });
        }
        cloud.position.set((hash2(i, 11, seed) - .5) * 430, 48 + hash2(i, 12, seed) * 43,
            (hash2(i, 13, seed) - .5) * 350);
        cloud.scale.setScalar(.7 + hash2(i, 14, seed) * 1.25);
        scene.add(cloud);
        clouds.push({ group: cloud, speed: .45 + hash2(i, 16, seed) * .55 });
    }

    /* ---------- terrain calculation ---------- */
    function baseTerrainHeight(x, z) {
        const broad = fbm(x * .013 + 4, z * .013 - 7, seed) - .5;
        const detail = fbm(x * .041 - 13, z * .041 + 9, seed + 33) - .5;
        const ridges = Math.abs(fbm(x * .008 + 70, z * .008 - 50, seed + 70) - .5);
        let h = broad * 18 + detail * 5 + Math.max(0, ridges - .27) * 16;
        const center = Math.hypot(x, z);
        if (center < 35) h = THREE.MathUtils.lerp(.8, h, smooth(18, 35, center));
        return Math.round(h / 1.25) * 1.25;
    }
    // 即使用户尚未购买湖泊，出生点远处也保留一条自然河道；购买 LAKE 后才会
    // 在指定位置永久改变高度场、生成可进入的蓝晶湖。
    const naturalLake = { x: -68, z: -55, radius: 16, floor: baseTerrainHeight(-68, -55) - 5,
        surface: baseTerrainHeight(-68, -55) - 1.2, natural: true };
    let lakeCache = [naturalLake];
    let flattenCache = [];
    function refreshTerrainModifiers() {
        const values = [...objectData.values()];
        lakeCache = [naturalLake, ...values.filter(o => o.kind === 'LAKE').map(o => ({
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
    const terrainSoilMat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, vertexColors: true });
    const terrainTopMat = new THREE.MeshStandardMaterial({ roughness: .94, metalness: 0, vertexColors: true });
    const terrainSoil = new THREE.InstancedMesh(cubeGeometry, terrainSoilMat, CELLS * CELLS);
    const terrainTop = new THREE.InstancedMesh(cubeGeometry, terrainTopMat, CELLS * CELLS);
    terrainSoil.receiveShadow = true;
    terrainTop.receiveShadow = true;
    terrainSoil.castShadow = false;
    terrainTop.castShadow = false;
    terrainSoil.frustumCulled = false;
    terrainTop.frustumCulled = false;
    terrainGroup.add(terrainSoil, terrainTop);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    function rebuildTerrain() {
        let index = 0;
        for (let ix = 0; ix < CELLS; ix++) {
            const x = -WORLD_HALF + CELL * (ix + .5);
            for (let iz = 0; iz < CELLS; iz++) {
                const z = -WORLD_HALF + CELL * (iz + .5);
                const h = heightAt(x, z);
                const soilHeight = Math.max(.3, h - BASE_Y - .42);
                position.set(x, BASE_Y + soilHeight / 2, z);
                scale.set(CELL + .035, soilHeight, CELL + .035);
                matrix.compose(position, quaternion, scale);
                terrainSoil.setMatrixAt(index, matrix);
                const moisture = fbm(x * .052, z * .052, seed + 301);
                const soilColor = isDesert ? colorWithLight(0x8e683b, (moisture - .5) * .18) :
                    colorWithLight(h > 7 ? 0x6e7275 : 0x6d4c32, (moisture - .5) * .16);
                terrainSoil.setColorAt(index, soilColor);

                position.set(x, h - .2, z);
                scale.set(CELL + .045, .42, CELL + .045);
                matrix.compose(position, quaternion, scale);
                terrainTop.setMatrixAt(index, matrix);
                let topColor;
                const inLake = lakeAt(x, z);
                if (inLake || h < -4) topColor = colorWithLight(0xc7ad73, (moisture - .5) * .15);
                else if (isDesert) topColor = colorWithLight(0xb59152, (moisture - .5) * .22);
                else if (h > 8) topColor = colorWithLight(0x7e8587, (moisture - .5) * .22);
                else if (isGloomy) topColor = colorWithLight(0x52735b, (moisture - .5) * .2);
                else topColor = colorWithLight(0x5d9b4e, (moisture - .5) * .26);
                terrainTop.setColorAt(index, topColor);
                index++;
            }
        }
        terrainSoil.instanceMatrix.needsUpdate = true;
        terrainTop.instanceMatrix.needsUpdate = true;
        if (terrainSoil.instanceColor) terrainSoil.instanceColor.needsUpdate = true;
        if (terrainTop.instanceColor) terrainTop.instanceColor.needsUpdate = true;
        terrainSoil.computeBoundingSphere();
        terrainTop.computeBoundingSphere();
    }
    rebuildTerrain();

    // 自然水体也使用方块岸线 + 半透明水面，不依赖外部水贴图。
    const naturalWater = new THREE.Mesh(new THREE.CircleGeometry(naturalLake.radius, 36), mat(0x2d98c1, {
        opacity: .7, roughness: .16, metalness: .12, emissive: 0x0a4c6a, emissiveIntensity: .18
    }));
    naturalWater.rotation.x = -Math.PI / 2;
    naturalWater.position.set(naturalLake.x, naturalLake.surface + .05, naturalLake.z);
    naturalWater.receiveShadow = true;
    scene.add(naturalWater);

    /* ---------- ambient voxel nature ---------- */
    const natureGroup = new THREE.Group();
    scene.add(natureGroup);
    function voxelTree(parent, x, z, size = 1, autumn = false, base = 0) {
        const trunk = autumn ? 0x72452c : 0x68452d;
        const leafColors = autumn ? [0xe2943b, 0xc86235, 0xf0b64b] :
            (isGloomy ? [0x365b45, 0x3f684d, 0x2d503b] : [0x397d42, 0x4a9147, 0x2f6d3b]);
        block(parent, x, base, z, 1.1 * size, 4.1 * size, 1.1 * size, trunk);
        const y = base + 3.6 * size;
        block(parent, x, y, z, 4.4 * size, 2.1 * size, 4.1 * size, leafColors[0]);
        block(parent, x - 1.25 * size, y + 1.1 * size, z + .55 * size, 2.7 * size, 2.2 * size, 2.8 * size, leafColors[1]);
        block(parent, x + 1.15 * size, y + 1.2 * size, z - .65 * size, 2.9 * size, 2.3 * size, 2.6 * size, leafColors[2]);
        block(parent, x, y + 2.45 * size, z, 2.45 * size, 1.55 * size, 2.4 * size, leafColors[1]);
    }
    function nearPlacedObject(x, z, padding = 0) {
        for (const obj of objectData.values()) {
            if (Math.hypot(x - obj.x, z - obj.z) < (FOOTPRINT[obj.kind] || 10) / 2 + padding) return true;
        }
        return false;
    }
    if (!isDesert) {
        let made = 0;
        for (let i = 0; i < 220 && made < (isGloomy ? 55 : 82); i++) {
            const x = (hash2(i, 22, seed) - .5) * (WORLD_SIZE - 24);
            const z = (hash2(i, 29, seed) - .5) * (WORLD_SIZE - 24);
            if (Math.hypot(x, z) < 38 || nearPlacedObject(x, z, 8) || lakeAt(x, z)) continue;
            const h = heightAt(x, z);
            if (h > 9 || h < -3) continue;
            const tree = new THREE.Group();
            voxelTree(tree, 0, 0, .72 + hash2(i, 33, seed) * .66, hash2(i, 34, seed) > .9, 0);
            tree.position.set(x, h, z);
            natureGroup.add(tree);
            made++;
        }
    }
    for (let i = 0; i < 42; i++) {
        const x = (hash2(i, 51, seed) - .5) * (WORLD_SIZE - 30);
        const z = (hash2(i, 57, seed) - .5) * (WORLD_SIZE - 30);
        if (Math.hypot(x, z) < 31 || nearPlacedObject(x, z, 5) || lakeAt(x, z)) continue;
        const rock = new THREE.Group();
        const s = .6 + hash2(i, 63, seed) * 1.4;
        block(rock, 0, 0, 0, 1.7 * s, 1.1 * s, 1.45 * s, isDesert ? 0x8d7659 : 0x69757a,
            { rotationY: hash2(i, 64, seed) * Math.PI });
        rock.position.set(x, heightAt(x, z), z);
        natureGroup.add(rock);
    }
    function refreshNatureVisibility() {
        natureGroup.children.forEach(child => {
            child.visible = !lakeAt(child.position.x, child.position.z) && !nearPlacedObject(child.position.x, child.position.z, 1);
        });
    }
    refreshNatureVisibility();

    // 出生广场：方块道路与发光传送台
    const spawn = new THREE.Group();
    for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
        if (Math.hypot(x, z) > 5.25) continue;
        const wx = x * 2.5, wz = z * 2.5;
        block(spawn, wx, heightAt(wx, wz) + .03, wz, 2.3, .22, 2.3,
            (x + z) % 2 ? 0x3f5968 : 0x526e78, { castShadow: false });
    }
    for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        const x = Math.sin(a) * 8.5, z = Math.cos(a) * 8.5;
        block(spawn, x, heightAt(x, z) + .22, z, .8, 2.8, .8, 0x32e6d0, {
            emissive: 0x18d8cb, emissiveIntensity: 1.35
        });
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
    function makeGarden(g) {
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
    function makeCamp(g) {
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
        const centerHeight = heightAt(obj.x, obj.z);
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
    function makeFountain(g) {
        const y = foundation(g, 12, 12, 0, 0xb8c5ca);
        block(g, 0, y, 0, 9.7, 1.15, 9.7, 0x7e929b);
        block(g, 0, y + 1.15, 0, 7.8, .36, 7.8, 0x58cbe5, {
            opacity: .78, emissive: 0x1f9ec0, emissiveIntensity: .45, castShadow: false
        });
        block(g, 0, y + 1.48, 0, 2.35, 2.7, 2.35, 0xb7c8ca);
        block(g, 0, y + 4.18, 0, 4.5, .65, 4.5, 0x8fa4a9);
        const jet = block(g, 0, y + 4.83, 0, .75, 4.7, .75, 0x77eaff, {
            opacity: .58, emissive: 0x2ecce9, emissiveIntensity: .72, castShadow: false
        });
        const light = new THREE.PointLight(0x43dfff, 1.8, 22, 2);
        light.position.set(0, y + 5, 0); g.add(light);
        animated.push({ type: 'waterJet', mesh: jet, light, baseY: jet.position.y });
    }
    function makeCrystal(g) {
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
    function makePavilion(g) {
        const y = foundation(g, 13, 13, 0, 0xb3aa95);
        const red = 0x8e332b, dark = 0x29313b, gold = 0xd7a950;
        for (const x of [-4.7, 4.7]) for (const z of [-4.7, 4.7]) column(g, x, z, y, 7.3, red, gold);
        block(g, 0, y + 7.3, 0, 13.7, .65, 13.7, dark);
        stepRoof(g, y + 7.95, 16, 16, 0x203747, 4, 0);
        block(g, 0, y + 10.83, 0, 3.2, 1.1, 3.2, gold);
        addLantern(g, -4.7, y + 4.4, -4.7, 0xffb234);
        addLantern(g, 4.7, y + 4.4, -4.7, 0xffb234);
    }
    function makeLake(g, obj) {
        const centerGround = heightAt(obj.x, obj.z);
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
    function makeCabin(g) {
        const y = foundation(g, 15, 13, 0, 0x7a684e);
        block(g, 0, y, 0, 13, 5.8, 10.5, 0x855a34);
        // 横向木纹梁
        for (let yy = y + .8; yy < y + 5.8; yy += 1.1) {
            block(g, 0, yy, 5.31, 13.3, .22, .2, 0x543821, { castShadow: false });
            block(g, 0, yy, -5.31, 13.3, .22, .2, 0x543821, { castShadow: false });
        }
        stepRoof(g, y + 5.8, 16, 13.5, 0x3b302c, 4, 0);
        block(g, 0, y, 5.42, 2.3, 4.5, .35, 0x312a27);
        addWindow(g, -4, y + 2, 5.45, 2.2, 2, 0, true);
        addWindow(g, 4, y + 2, 5.45, 2.2, 2, 0, true);
        block(g, 4.1, y + 6.4, -2.5, 1.8, 5, 1.8, 0x594a42);
        block(g, 4.1, y + 11.4, -2.5, 2.3, .65, 2.3, 0x32343a);
    }
    function makeFarm(g) {
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
    function makeLibrary(g) {
        const y = foundation(g, 31, 25, 0, 0xbcae91);
        const stone = 0xd2c4a6, lightStone = 0xeee2c5, dark = 0x263342;
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
    function makeCastle(g) {
        const y = foundation(g, 43, 39, 0, 0x788899);
        const stone = 0x8f9da7, pale = 0xb8c5ca, dark = 0x263746, blue = 0x385b78;
        // 四面城墙（正门留空）
        block(g, 0, y, -17, 38, 9, 3, stone);
        block(g, -18.5, y, 0, 3, 9, 36, stone);
        block(g, 18.5, y, 0, 3, 9, 36, stone);
        block(g, -11.7, y, 17, 13.5, 9, 3, stone);
        block(g, 11.7, y, 17, 13.5, 9, 3, stone);
        // 垛口
        for (let x = -18; x <= 18; x += 3.5) {
            block(g, x, y + 9, -17, 2.1, 1.7, 3.2, pale);
            if (Math.abs(x) > 5) block(g, x, y + 9, 17, 2.1, 1.7, 3.2, pale);
        }
        for (let z = -14; z <= 14; z += 3.5) {
            block(g, -18.5, y + 9, z, 3.2, 1.7, 2.1, pale);
            block(g, 18.5, y + 9, z, 3.2, 1.7, 2.1, pale);
        }
        function tower(x, z, tall = false) {
            const h = tall ? 24 : 17;
            block(g, x, y, z, tall ? 10 : 8, h, tall ? 10 : 8, stone);
            block(g, x, y + h, z, tall ? 12 : 10, 1.25, tall ? 12 : 10, dark);
            for (let i = 0; i < 3; i++) {
                const w = (tall ? 10.5 : 8.5) - i * 2.4;
                block(g, x, y + h + 1.25 + i * 1.15, z, w, 1.15, w, blue);
            }
            for (const side of [-1, 1]) {
                addWindow(g, x + side * (tall ? 2.5 : 1.7), y + h * .48, z + (tall ? 5.08 : 4.08),
                    1.35, 2.7, 0, false);
            }
        }
        tower(-16.5, -15, false); tower(16.5, -15, false);
        tower(-16.5, 15, false); tower(16.5, 15, false);
        tower(0, -1, true);
        // 主殿连接中心塔
        block(g, 0, y, -3, 24, 13.5, 20, 0x778894);
        block(g, 0, y + 13.5, -3, 26, 1.25, 22, dark);
        stepRoof(g, y + 14.75, 25, 21, blue, 4, 0);
        for (const x of [-8, -4, 4, 8]) addWindow(g, x, y + 5, 7.08, 1.8, 3.5, 0, true);
        // 门楼 / 吊桥 / 门楣光带
        block(g, -5.2, y, 16.7, 4.4, 14, 5.5, stone);
        block(g, 5.2, y, 16.7, 4.4, 14, 5.5, stone);
        block(g, 0, y + 7.8, 16.7, 6.5, 6.2, 5.5, stone);
        block(g, 0, y + .2, 18.35, 5.4, 7.6, .25, 0x182733);
        block(g, 0, y - .24, 22.7, 7, .5, 10, 0x765139);
        addLantern(g, -4.1, y + 5.1, 19.5, 0x63ebff);
        addLantern(g, 4.1, y + 5.1, 19.5, 0x63ebff);
        flag(g, 0, y + 30.9, -1, 0x64e8e1);
        flag(g, -16.5, y + 22, -15, 0xffd061);
        flag(g, 16.5, y + 22, -15, 0xffd061);
        // 悬浮能源方块
        const core = block(g, 0, y + 24.3, -1, 2.3, 2.3, 2.3, 0x74efff, {
            opacity: .88, emissive: 0x3be6ff, emissiveIntensity: 1.7, metalness: .3
        });
        const coreLight = new THREE.PointLight(0x62e9ff, 4.2, 58, 2);
        coreLight.position.set(0, y + 25.5, -1); g.add(coreLight);
        animated.push({ type: 'castleCore', mesh: core, light: coreLight, baseY: core.position.y });
    }

    function createWorldObject(raw) {
        const obj = normalizeObject(raw);
        if (!obj) return null;
        const g = new THREE.Group();
        g.userData.worldObject = obj;
        switch (obj.kind) {
            case 'ROCKS': makeRocks(g, obj); break;
            case 'GARDEN': makeGarden(g); break;
            case 'CAMP': makeCamp(g); break;
            case 'FOREST': makeForest(g, obj); break;
            case 'FOUNTAIN': makeFountain(g); break;
            case 'CRYSTAL': makeCrystal(g); break;
            case 'PAVILION': makePavilion(g); break;
            case 'LAKE': makeLake(g, obj); break;
            case 'CABIN': makeCabin(g); break;
            case 'FARM': makeFarm(g); break;
            case 'LIBRARY': makeLibrary(g); break;
            case 'CASTLE': makeCastle(g); break;
            default: return null;
        }
        g.position.set(obj.x, heightAt(obj.x, obj.z), obj.z);
        // 建筑和森林都可以通过点击识别，而不是只能看。
        g.traverse(child => { child.userData.worldObject = obj; });
        objectRoot.add(g);
        objectGroups.set(String(obj.id), g);
        return g;
    }
    function removeVisualObject(id) {
        const key = String(id);
        const group = objectGroups.get(key);
        if (!group) return false;
        for (let i = animated.length - 1; i >= 0; i--) {
            const ref = animated[i].mesh || animated[i].group;
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
    function colorHex(value, fallback = '#57e6d5') {
        return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback;
    }
    function createAvatar(avatar) {
        const style = ['EXPLORER', 'ARCHITECT', 'RANGER', 'ASTRONAUT'].includes(String(avatar.style).toUpperCase()) ?
            String(avatar.style).toUpperCase() : 'EXPLORER';
        const primary = colorHex(avatar.color);
        const primaryColor = new THREE.Color(primary);
        const darkPrimary = primaryColor.clone().lerp(new THREE.Color(0x0c1821), .46);
        const skin = new THREE.Color(colorHex(avatar.skinColor, style === 'RANGER' ? '#B87950' : '#E0AD82'));
        const hair = new THREE.Color(colorHex(avatar.hairColor, '#4C3328'));
        const rig = new THREE.Group();
        const torso = new THREE.Group(), head = new THREE.Group();
        const leftArm = new THREE.Group(), rightArm = new THREE.Group();
        const leftLeg = new THREE.Group(), rightLeg = new THREE.Group();
        torso.position.y = 2.35;
        head.position.y = 4.4;
        leftArm.position.set(-.77, 3.3, 0); rightArm.position.set(.77, 3.3, 0);
        leftLeg.position.set(-.31, 2.05, 0); rightLeg.position.set(.31, 2.05, 0);
        // 腿和靴子
        block(leftLeg, 0, -2.05, 0, .55, 1.95, .65, darkPrimary);
        block(rightLeg, 0, -2.05, 0, .55, 1.95, .65, darkPrimary);
        block(leftLeg, 0, -2.05, -.08, .61, .5, .82, 0x25313a);
        block(rightLeg, 0, -2.05, -.08, .61, .5, .82, 0x25313a);
        // 胸甲与手臂
        block(torso, 0, 0, 0, 1.35, 1.75, .72, primary);
        block(torso, 0, .25, -.38, 1.05, .34, .08, style === 'ASTRONAUT' ? 0x78e9ff : 0xf1d16d,
            { emissive: style === 'ASTRONAUT' ? 0x28bdd8 : 0, emissiveIntensity: .45 });
        block(leftArm, 0, -1.65, 0, .48, 1.72, .52, style === 'ASTRONAUT' ? 0xecf3f3 : primary);
        block(rightArm, 0, -1.65, 0, .48, 1.72, .52, style === 'ASTRONAUT' ? 0xecf3f3 : primary);
        block(leftArm, 0, -1.65, 0, .5, .42, .54, skin);
        block(rightArm, 0, -1.65, 0, .5, .42, .54, skin);
        // 头、头发、眼睛
        block(head, 0, -1.25, 0, 1.12, 1.12, 1.08, skin);
        block(head, 0, -.13, 0, 1.18, .28, 1.12, style === 'ARCHITECT' ? 0xf0b934 : hair);
        block(head, -.25, -.84, -.55, .13, .15, .08, 0x152330, { castShadow: false });
        block(head, .25, -.84, -.55, .13, .15, .08, 0x152330, { castShadow: false });
        // 四种形象差异不是简单换色：探险背包、建筑师安全帽、游侠兜帽、宇航员玻璃头盔。
        if (style === 'EXPLORER') {
            block(torso, 0, -.05, .56, 1.13, 1.5, .42, 0x765039);
            block(head, 0, -.05, 0, 1.55, .26, 1.55, primary);
            block(head, 0, .13, 0, 1.05, .42, 1.06, primary);
        } else if (style === 'ARCHITECT') {
            block(head, 0, -.02, 0, 1.5, .32, 1.46, 0xf4be35);
            block(head, 0, .2, .05, 1.05, .38, 1.05, 0xf4be35);
            block(torso, 0, .5, -.41, .25, 1.25, .08, 0xeaf0ec);
            block(torso, -.45, 0, -.42, .17, 1.45, .08, 0xf3cc40);
            block(torso, .45, 0, -.42, .17, 1.45, .08, 0xf3cc40);
        } else if (style === 'RANGER') {
            block(head, 0, -.55, .16, 1.5, 1.65, 1.42, darkPrimary, { opacity: .95 });
            block(head, 0, -1.2, -.63, 1.02, .88, .12, skin);
            block(torso, 0, .38, -.42, 1.1, .24, .1, 0xb3915a);
        } else {
            block(head, 0, -.61, 0, 1.72, 1.72, 1.65, 0xe8f0f2);
            block(head, 0, -.85, -.87, 1.35, .85, .12, 0x5fcbe5, {
                opacity: .64, emissive: 0x168db2, emissiveIntensity: .35, castShadow: false
            });
            block(torso, 0, .02, .55, 1.12, 1.35, .42, 0xdce9eb);
            block(torso, 0, .6, -.42, .68, .3, .08, 0x54e2e1, {
                emissive: 0x28bebf, emissiveIntensity: .52
            });
        }
        rig.add(torso, head, leftArm, rightArm, leftLeg, rightLeg);
        rig.userData = { style, parts: { leftArm, rightArm, leftLeg, rightLeg, head, torso } };
        rig.traverse(o => { if (o.isMesh) o.castShadow = true; });
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
        player.group.rotation.y = player.heading;
        if (player.rig) {
            const parts = player.rig.userData.parts;
            const cadence = elapsed * (keys.shift ? 15 : 10);
            const swing = moving ? Math.sin(cadence) * (keys.shift ? .78 : .52) : 0;
            parts.leftArm.rotation.x = THREE.MathUtils.damp(parts.leftArm.rotation.x, -swing, 12, dt);
            parts.rightArm.rotation.x = THREE.MathUtils.damp(parts.rightArm.rotation.x, swing, 12, dt);
            parts.leftLeg.rotation.x = THREE.MathUtils.damp(parts.leftLeg.rotation.x, swing, 12, dt);
            parts.rightLeg.rotation.x = THREE.MathUtils.damp(parts.rightLeg.rotation.x, -swing, 12, dt);
            player.rig.position.y = moving ? Math.abs(Math.sin(cadence * 2)) * .08 : Math.sin(elapsed * 2.1) * .025;
        }
    }
    function animateWorld(dt) {
        clouds.forEach((cloud, i) => {
            cloud.group.position.x += cloud.speed * dt;
            if (cloud.group.position.x > 235) cloud.group.position.x = -235;
            cloud.group.position.y += Math.sin(elapsed * .16 + i) * dt * .06;
        });
        stars.material.opacity = (isGloomy ? .36 : .56) + Math.sin(elapsed * .5) * .08;
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
        renderer.render(scene, camera);
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
        materialCache.forEach(m => m.dispose());
        terrainSoilMat.dispose(); terrainTopMat.dispose(); previewMaterial.dispose();
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
