/**
 * Optional camera gesture controls for the planet view.
 *
 * Nothing is downloaded and no camera permission is requested until start()
 * is called from an explicit user action.
 *
 * Public API:
 *   window.GestureControls.start({ video, onPinchRelease, onSwipe, onStatus })
 *   window.GestureControls.stop()
 *   window.GestureControls.isRunning()
 */
(function installGestureControls(global) {
    "use strict";

    if (global.GestureControls && global.GestureControls.__selfDisciplineGestureControls) {
        return;
    }

    // Pin the runtime so a CDN update cannot silently change gesture behaviour.
    // 注意：必须是 npm 上真实发布过的稳定版。0.10.22 只有 rc 预发布、无正式版，
    // 会导致 CDN 404、手势模型加载失败。0.10.21 是紧邻的最后一个稳定版。
    const MEDIAPIPE_VERSION = "0.10.21";
    const MEDIAPIPE_MODULE =
        `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
    const MEDIAPIPE_WASM =
        `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
    const HAND_MODEL =
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

    const CLOSE_PINCH_RATIO = 0.32;
    const OPEN_PINCH_RATIO = 0.58;
    const REQUIRED_STABLE_FRAMES = 3;
    const LOST_HAND_FRAMES = 7;
    const PINCH_COOLDOWN_MS = 650;
    const SWIPE_THROTTLE_MS = 90;
    const SWIPE_DEAD_ZONE = 0.012;
    const PALM_SMOOTHING = 0.42;

    let epoch = 0;
    let starting = false;
    let running = false;
    let startPromise = null;
    let stream = null;
    let detector = null;
    let animationFrameId = 0;
    let activeVideo = null;
    let ownsVideo = false;
    let originalVideoState = null;
    let videoIsMirrored = false;
    let visionModulePromise = null;
    let pageHideInstalled = false;

    let callbacks = {
        onPinchRelease: null,
        onSwipe: null,
        onStatus: null
    };

    let lastVideoTime = -1;
    let detectionErrorCount = 0;
    let handVisible = false;
    let missingHandFrames = 0;
    let closedPinchFrames = 0;
    let openPinchFrames = 0;
    let pinching = false;
    let lastPinchReleaseAt = 0;
    let smoothedPalmX = null;
    let previousPalmX = null;
    let swipeAccumulator = 0;
    let lastSwipeEmitAt = 0;

    function now() {
        return global.performance && typeof global.performance.now === "function"
            ? global.performance.now()
            : Date.now();
    }

    function resetTrackingState() {
        lastVideoTime = -1;
        detectionErrorCount = 0;
        handVisible = false;
        missingHandFrames = 0;
        closedPinchFrames = 0;
        openPinchFrames = 0;
        pinching = false;
        lastPinchReleaseAt = 0;
        smoothedPalmX = null;
        previousPalmX = null;
        swipeAccumulator = 0;
        lastSwipeEmitAt = 0;
    }

    function emitStatus(message, state, error) {
        if (typeof callbacks.onStatus !== "function") {
            return;
        }

        const detail = {
            message,
            state,
            running,
            timestamp: Date.now()
        };
        if (error) {
            detail.error = error;
        }

        try {
            callbacks.onStatus(detail, message);
        } catch (callbackError) {
            // A UI callback must never stop camera cleanup or gesture tracking.
            console.error("[GestureControls] onStatus callback failed", callbackError);
        }
    }

    function invokeGestureCallback(callback, args, callbackName) {
        if (typeof callback !== "function") {
            return;
        }
        try {
            callback.apply(null, args);
        } catch (error) {
            console.error(`[GestureControls] ${callbackName} callback failed`, error);
            emitStatus("手势已识别，但页面响应失败", "callback-error", error);
        }
    }

    function stopTracks(mediaStream) {
        if (!mediaStream || typeof mediaStream.getTracks !== "function") {
            return;
        }
        mediaStream.getTracks().forEach((track) => {
            try {
                track.stop();
            } catch (error) {
                console.debug("[GestureControls] camera track was already stopped", error);
            }
        });
    }

    function closeDetector(handDetector) {
        if (!handDetector || typeof handDetector.close !== "function") {
            return;
        }
        try {
            const result = handDetector.close();
            if (result && typeof result.catch === "function") {
                result.catch((error) => {
                    console.debug("[GestureControls] detector close failed", error);
                });
            }
        } catch (error) {
            console.debug("[GestureControls] detector was already closed", error);
        }
    }

    function restoreVideo(cameraStream) {
        const video = activeVideo;
        if (!video) {
            return;
        }

        try {
            if (video.srcObject === cameraStream) {
                video.srcObject = originalVideoState ? originalVideoState.srcObject : null;
            }
            if (originalVideoState) {
                video.muted = originalVideoState.muted;
                video.autoplay = originalVideoState.autoplay;
                video.playsInline = originalVideoState.playsInline;
            }
        } catch (error) {
            console.debug("[GestureControls] video reset failed", error);
        }

        if (ownsVideo && video.parentNode) {
            video.parentNode.removeChild(video);
        }
    }

    function cleanupResources() {
        if (animationFrameId) {
            global.cancelAnimationFrame(animationFrameId);
            animationFrameId = 0;
        }

        const cameraStream = stream;
        const handDetector = detector;
        stream = null;
        detector = null;

        stopTracks(cameraStream);
        closeDetector(handDetector);
        restoreVideo(cameraStream);

        activeVideo = null;
        originalVideoState = null;
        ownsVideo = false;
        starting = false;
        running = false;
        resetTrackingState();

        if (pageHideInstalled) {
            global.removeEventListener("pagehide", handlePageHide);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            pageHideInstalled = false;
        }
    }

    function handlePageHide() {
        stop();
    }

    function handleVisibilityChange() {
        // Never leave the camera running invisibly in a background tab.
        if (document.visibilityState === "hidden") {
            stop();
        }
    }

    function resolveVideo(videoOption) {
        let video = videoOption;
        if (typeof videoOption === "string") {
            video = document.querySelector(videoOption);
        }

        if (video && String(video.nodeName).toLowerCase() !== "video") {
            throw createNamedError("InvalidVideoError", "video 必须是 HTMLVideoElement 或有效的选择器");
        }

        if (!video) {
            video = document.createElement("video");
            video.setAttribute("aria-hidden", "true");
            video.tabIndex = -1;
            Object.assign(video.style, {
                position: "fixed",
                left: "-10000px",
                top: "0",
                width: "1px",
                height: "1px",
                opacity: "0",
                pointerEvents: "none"
            });
            (document.body || document.documentElement).appendChild(video);
            ownsVideo = true;
        }

        return video;
    }

    function createNamedError(name, message) {
        const error = new Error(message);
        error.name = name;
        return error;
    }

    function isLocalAddress(hostname) {
        return hostname === "localhost"
            || hostname === "127.0.0.1"
            || hostname === "::1"
            || hostname === "[::1]";
    }

    function assertCameraSupport() {
        if (!global.isSecureContext && !isLocalAddress(global.location.hostname)) {
            throw createNamedError(
                "InsecureContextError",
                "手势控制需要通过 HTTPS 或 localhost 打开"
            );
        }
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
            throw createNamedError("UnsupportedError", "当前浏览器不支持摄像头手势控制");
        }
        if (typeof global.requestAnimationFrame !== "function") {
            throw createNamedError("UnsupportedError", "当前浏览器不支持实时手势识别");
        }
    }

    function detectMirroredVideo(video) {
        try {
            const transform = global.getComputedStyle(video).transform;
            if (!transform || transform === "none") {
                return false;
            }
            if (typeof global.DOMMatrixReadOnly === "function") {
                return new global.DOMMatrixReadOnly(transform).a < 0;
            }
            const matrix = transform.match(/^matrix\(([^)]+)\)$/);
            return Boolean(matrix && Number(matrix[1].split(",")[0]) < 0);
        } catch (error) {
            return false;
        }
    }

    function loadVisionModule() {
        if (!visionModulePromise) {
            visionModulePromise = import(MEDIAPIPE_MODULE).catch((error) => {
                // Allow a retry after a temporary CDN/network failure.
                visionModulePromise = null;
                throw error;
            });
        }
        return visionModulePromise;
    }

    async function waitUntilVideoIsReady(video, token, getPlayError) {
        const timeoutAt = Date.now() + 12000;
        while (Date.now() < timeoutAt) {
            if (token !== epoch) {
                throw createNamedError("StartCancelledError", "手势控制启动已取消");
            }
            const playError = getPlayError();
            if (playError) {
                throw playError;
            }
            if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
                return;
            }
            await new Promise((resolve) => global.setTimeout(resolve, 80));
        }
        throw createNamedError("VideoTimeoutError", "摄像头画面读取超时");
    }

    async function createHandDetector(FilesetResolver, HandLandmarker, token) {
        const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
        if (token !== epoch) {
            throw createNamedError("StartCancelledError", "手势控制启动已取消");
        }

        const commonOptions = {
            runningMode: "VIDEO",
            numHands: 1,
            minHandDetectionConfidence: 0.55,
            minHandPresenceConfidence: 0.55,
            minTrackingConfidence: 0.5
        };

        try {
            return await HandLandmarker.createFromOptions(vision, {
                ...commonOptions,
                baseOptions: {
                    modelAssetPath: HAND_MODEL,
                    delegate: "GPU"
                }
            });
        } catch (gpuError) {
            if (token !== epoch) {
                throw createNamedError("StartCancelledError", "手势控制启动已取消");
            }
            emitStatus("GPU 模式不可用，正在切换兼容模式…", "loading-model");
            return HandLandmarker.createFromOptions(vision, {
                ...commonOptions,
                baseOptions: { modelAssetPath: HAND_MODEL }
            });
        }
    }

    function distance2d(pointA, pointB) {
        return Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y);
    }

    function palmCenterX(landmarks) {
        // Wrist plus the four MCP joints is steadier than using a fingertip.
        const jointIndexes = [0, 5, 9, 13, 17];
        const rawX = jointIndexes.reduce((sum, index) => sum + landmarks[index].x, 0)
            / jointIndexes.length;
        return videoIsMirrored ? 1 - rawX : rawX;
    }

    function handednessFromResult(result) {
        const category = result.handednesses
            && result.handednesses[0]
            && result.handednesses[0][0];
        return category ? (category.categoryName || category.displayName || null) : null;
    }

    function resetSwipePosition() {
        smoothedPalmX = null;
        previousPalmX = null;
        swipeAccumulator = 0;
    }

    function processSwipe(landmarks, timestamp, suppressSwipe) {
        const palmX = palmCenterX(landmarks);
        if (smoothedPalmX === null) {
            smoothedPalmX = palmX;
            previousPalmX = palmX;
            lastSwipeEmitAt = timestamp;
            return;
        }

        smoothedPalmX += (palmX - smoothedPalmX) * PALM_SMOOTHING;
        const delta = smoothedPalmX - previousPalmX;
        previousPalmX = smoothedPalmX;

        // A very large one-frame jump means tracking was reacquired, not swiped.
        if (Math.abs(delta) > 0.18) {
            swipeAccumulator = 0;
            return;
        }

        if (suppressSwipe) {
            swipeAccumulator = 0;
            return;
        }

        swipeAccumulator += delta;
        if (timestamp - lastSwipeEmitAt < SWIPE_THROTTLE_MS) {
            return;
        }

        if (Math.abs(swipeAccumulator) >= SWIPE_DEAD_ZONE) {
            const dx = Math.max(-0.25, Math.min(0.25, swipeAccumulator));
            invokeGestureCallback(
                callbacks.onSwipe,
                [dx, { x: smoothedPalmX, timestamp: Date.now() }],
                "onSwipe"
            );
        }
        swipeAccumulator = 0;
        lastSwipeEmitAt = timestamp;
    }

    function processPinch(landmarks, result, timestamp) {
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        // Normalize against palm width so the threshold works near and far away.
        const palmWidth = Math.max(distance2d(landmarks[5], landmarks[17]), 0.001);
        const pinchRatio = distance2d(thumbTip, indexTip) / palmWidth;

        if (pinchRatio <= CLOSE_PINCH_RATIO) {
            closedPinchFrames += 1;
            openPinchFrames = 0;
            if (!pinching && closedPinchFrames >= REQUIRED_STABLE_FRAMES) {
                pinching = true;
                resetSwipePosition();
                emitStatus("已捏住，张开手指即可切换星球视图", "pinching");
            }
        } else if (pinchRatio >= OPEN_PINCH_RATIO) {
            closedPinchFrames = 0;
            if (pinching) {
                openPinchFrames += 1;
                if (openPinchFrames >= REQUIRED_STABLE_FRAMES) {
                    pinching = false;
                    openPinchFrames = 0;
                    resetSwipePosition();
                    if (timestamp - lastPinchReleaseAt >= PINCH_COOLDOWN_MS) {
                        lastPinchReleaseAt = timestamp;
                        const x = videoIsMirrored ? 1 - indexTip.x : indexTip.x;
                        invokeGestureCallback(
                            callbacks.onPinchRelease,
                            [{
                                x,
                                y: indexTip.y,
                                handedness: handednessFromResult(result),
                                timestamp: Date.now()
                            }],
                            "onPinchRelease"
                        );
                        emitStatus("已识别捏合并张开手势", "pinch-release");
                    }
                }
            }
        } else {
            closedPinchFrames = Math.max(0, closedPinchFrames - 1);
            openPinchFrames = 0;
        }

        return pinching;
    }

    function processHandResult(result, timestamp) {
        const landmarks = result && result.landmarks && result.landmarks[0];
        if (!landmarks || landmarks.length < 21) {
            missingHandFrames += 1;
            if (missingHandFrames >= LOST_HAND_FRAMES) {
                if (handVisible) {
                    handVisible = false;
                    emitStatus("请将一只手放到摄像头前", "waiting-for-hand");
                }
                pinching = false;
                closedPinchFrames = 0;
                openPinchFrames = 0;
                resetSwipePosition();
            }
            return;
        }

        missingHandFrames = 0;
        if (!handVisible) {
            handVisible = true;
            emitStatus("已识别手掌：左右移动或做捏合手势", "tracking");
        }

        const pinchIsActive = processPinch(landmarks, result, timestamp);
        processSwipe(landmarks, timestamp, pinchIsActive);
    }

    function runtimeFailure(error) {
        const statusCallback = callbacks.onStatus;
        epoch += 1;
        cleanupResources();
        callbacks.onStatus = statusCallback;
        emitStatus("手势识别已停止，请重新开启", "error", error);
    }

    function detectionLoop(token) {
        if (!running || token !== epoch || !detector || !activeVideo) {
            return;
        }

        const timestamp = now();
        try {
            if (activeVideo.readyState >= 2 && activeVideo.currentTime !== lastVideoTime) {
                lastVideoTime = activeVideo.currentTime;
                const result = detector.detectForVideo(activeVideo, timestamp);
                detectionErrorCount = 0;
                processHandResult(result, timestamp);
            }
        } catch (error) {
            detectionErrorCount += 1;
            if (detectionErrorCount === 1) {
                emitStatus("手势识别暂时中断，正在自动恢复…", "recovering", error);
            }
            if (detectionErrorCount >= 5) {
                runtimeFailure(error);
                return;
            }
        }

        animationFrameId = global.requestAnimationFrame(() => detectionLoop(token));
    }

    function friendlyErrorMessage(error, stage) {
        const name = error && error.name;
        if (name === "InsecureContextError") {
            return "手势控制需要通过 HTTPS 或 localhost 打开";
        }
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
            return "未获得摄像头权限，手势控制未开启";
        }
        if (name === "NotFoundError" || name === "DevicesNotFoundError") {
            return "没有检测到可用摄像头";
        }
        if (name === "NotReadableError" || name === "TrackStartError") {
            return "摄像头正被其他应用占用";
        }
        if (name === "OverconstrainedError") {
            return "摄像头不支持所需的视频模式";
        }
        if (name === "VideoTimeoutError") {
            return "摄像头画面读取超时，请重试";
        }
        if (name === "UnsupportedError" || name === "InvalidVideoError") {
            return error.message;
        }
        if (stage === "model") {
            return "手势模型加载失败，请检查网络后重试";
        }
        return "手势控制启动失败，请重试";
    }

    async function beginStart(options, token) {
        let stage = "camera";
        let requestedStream = null;
        let createdDetector = null;

        try {
            assertCameraSupport();
            activeVideo = resolveVideo(options.video);
            originalVideoState = {
                srcObject: activeVideo.srcObject || null,
                muted: activeVideo.muted,
                autoplay: activeVideo.autoplay,
                playsInline: activeVideo.playsInline
            };

            emitStatus("正在请求摄像头权限…", "requesting-camera");
            requestedStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: "user",
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                },
                audio: false
            });

            if (token !== epoch) {
                stopTracks(requestedStream);
                return false;
            }
            stream = requestedStream;

            activeVideo.muted = true;
            activeVideo.autoplay = true;
            activeVideo.playsInline = true;
            activeVideo.srcObject = stream;

            let playError = null;
            try {
                const playResult = activeVideo.play();
                if (playResult && typeof playResult.catch === "function") {
                    playResult.catch((error) => {
                        playError = error;
                    });
                }
            } catch (error) {
                playError = error;
            }
            await waitUntilVideoIsReady(activeVideo, token, () => playError);
            videoIsMirrored = detectMirroredVideo(activeVideo);

            stage = "model";
            emitStatus("正在加载手势识别模型（仅首次需要）…", "loading-model");
            const visionModule = await loadVisionModule();
            if (token !== epoch) {
                return false;
            }

            // Support both MediaPipe's named exports and CDN wrappers that
            // expose the same API under `default`.
            const visionApi = visionModule.default || visionModule;
            const FilesetResolver = visionModule.FilesetResolver || visionApi.FilesetResolver;
            const HandLandmarker = visionModule.HandLandmarker || visionApi.HandLandmarker;
            if (!FilesetResolver || !HandLandmarker) {
                throw createNamedError("ModelApiError", "MediaPipe 手势模块不可用");
            }

            createdDetector = await createHandDetector(FilesetResolver, HandLandmarker, token);
            if (token !== epoch) {
                closeDetector(createdDetector);
                return false;
            }

            detector = createdDetector;
            createdDetector = null;
            starting = false;
            running = true;
            resetTrackingState();
            if (!pageHideInstalled) {
                global.addEventListener("pagehide", handlePageHide);
                document.addEventListener("visibilitychange", handleVisibilityChange);
                pageHideInstalled = true;
            }
            emitStatus("手势控制已开启，请将手放到摄像头前", "ready");
            detectionLoop(token);
            return true;
        } catch (error) {
            if (createdDetector) {
                closeDetector(createdDetector);
            }
            if (requestedStream && requestedStream !== stream) {
                stopTracks(requestedStream);
            }

            if (token !== epoch || (error && error.name === "StartCancelledError")) {
                return false;
            }

            const message = friendlyErrorMessage(error, stage);
            const reportedError = createNamedError(
                error && error.name ? error.name : "GestureStartError",
                message
            );
            reportedError.cause = error;
            // cleanupResources restores/removes `activeVideo`, stops `stream`,
            // and closes the detector. Keep the caller's status callback so
            // the failure can still be reported after cleanup.
            const statusCallback = callbacks.onStatus;
            epoch += 1;
            cleanupResources();
            callbacks.onStatus = statusCallback;
            emitStatus(message, "error", reportedError);
            // Reject start() so callers using `await` do not accidentally mark
            // the feature as enabled after a permission/model failure.
            throw reportedError;
        }
    }

    function start(options) {
        const config = options || {};

        callbacks = {
            onPinchRelease: typeof config.onPinchRelease === "function"
                ? config.onPinchRelease
                : null,
            onSwipe: typeof config.onSwipe === "function" ? config.onSwipe : null,
            onStatus: typeof config.onStatus === "function" ? config.onStatus : null
        };

        if (running) {
            emitStatus("手势控制已开启", "ready");
            return Promise.resolve(true);
        }
        if (starting && startPromise) {
            return startPromise;
        }

        // Invalidate any incomplete previous session and release every resource.
        epoch += 1;
        cleanupResources();
        const token = epoch;
        starting = true;
        resetTrackingState();

        // Begin on the next microtask. This keeps start() consistently
        // promise-based even if setup fails before the first await.
        const pendingStart = Promise.resolve().then(() => beginStart(config, token));
        const trackedStart = pendingStart.finally(() => {
            // An older cancelled start may settle after a new session has
            // begun; it must not erase the newer session's promise.
            if (startPromise === trackedStart) {
                startPromise = null;
            }
        });
        startPromise = trackedStart;
        return startPromise;
    }

    function stop() {
        const wasActive = starting || running || Boolean(stream) || Boolean(detector);
        const statusCallback = callbacks.onStatus;
        epoch += 1;
        cleanupResources();
        startPromise = null;
        callbacks = {
            onPinchRelease: null,
            onSwipe: null,
            onStatus: statusCallback
        };
        if (wasActive) {
            emitStatus("手势控制已关闭，摄像头已释放", "stopped");
        }
        callbacks.onStatus = null;
    }

    function isRunning() {
        return running;
    }

    global.GestureControls = {
        start,
        stop,
        isRunning
    };
    Object.defineProperty(global.GestureControls, "__selfDisciplineGestureControls", {
        value: true,
        enumerable: false
    });
})(window);
