// Add this at the top of the file
const DEBUG = {
    enabled: true,
    logLevel: 'info', // 'info', 'warn', 'error'
    init: false
};

function debugLog(message, level = 'info', error = null) {
    if (!DEBUG.enabled) return;

    const styles = {
        info: 'color: #4CAF50',
        warn: 'color: #FFC107',
        error: 'color: #F44336; font-weight: bold'
    };

    if (level === 'error') {
        console.group('%cError in Gran Turismo Game', styles[level]);
        console.error(message);
        if (error) {
            console.error('Error details:', error);
            console.error('Stack trace:', error.stack);
        }
        console.groupEnd();
    } else {
        console.log(`%c${level.toUpperCase()}: ${message}`, styles[level]);
    }
}

// Wait for Three.js to be fully loaded
function waitForThree() {
    return new Promise((resolve, reject) => {
        if (typeof THREE !== 'undefined') {
            debugLog('Three.js is already loaded');
            resolve();
            return;
        }

        let attempts = 0;
        const maxAttempts = 50; // 5 seconds total

        const checkInterval = setInterval(() => {
            attempts++;
            if (typeof THREE !== 'undefined') {
                clearInterval(checkInterval);
                debugLog('Three.js loaded successfully after ' + attempts + ' attempts');
                resolve();
            } else if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                reject(new Error('Failed to load Three.js after ' + attempts + ' attempts'));
            }
        }, 100);
    });
}

// Create car function
function createCar() {
    const carBody = new THREE.Group();

    // Main body
    const bodyGeometry = new THREE.BoxGeometry(2, 0.5, 4);
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        roughness: 0.3,
        metalness: 0.7
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = true;
    carBody.add(body);

    // Cabin
    const cabinGeometry = new THREE.BoxGeometry(1.5, 0.8, 2);
    const cabinMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.1,
        metalness: 0.9
    });
    const cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
    cabin.position.y = 0.5;
    cabin.position.z = 0.4;
    cabin.castShadow = true;
    carBody.add(cabin);

    return carBody;
}

// Core game state and constants
const GAME_STATE = {
    carSpeed: 0,
    currentLap: 1,
    totalLaps: 3,
    track: null,
    car: null,
    camera: null,
    scene: null,
    renderer: null,
    controls: {
        accelerate: false,
        brake: false,
        turnLeft: false,
        turnRight: false,
        handbrake: false
    },
    fps: 0,
    frameCount: 0,
    lastTime: performance.now(),
    miniMap: {
        size: 150,
        scale: 0.5
    }
};

const PHYSICS = {
    maxSpeed: 1.5,
    acceleration: 0.02,
    braking: 0.04,
    deceleration: 0.01,
    turnSpeed: 0.02,
    maxTurnAngle: 0.7,
    gripFactor: 0.92,
    groundLevel: 0.25,
    // Adjust handbrake physics for more noticeable effect
    handbrakeGripLoss: 0.7,    // Increased grip loss (was 0.5)
    handbrakeRotation: 0.06,   // Increased rotation speed (was 0.04)
    driftDecay: 0.95,          // Adjusted drift decay (was 0.98)
    handbrakeMinSpeed: 0.3,     // Minimum speed for handbrake to work
    surfaceEffects: {
        track: {
            grip: 1.0,
            rolling: 0.99
        },
        grass: {
            grip: 0.3,
            rolling: 0.95
        },
        gravel: {
            grip: 0.4,
            rolling: 0.90
        }
    },
    gravity: 9.81,
    downforce: 0.3
};

// Add these constants for terrain and track
const TERRAIN = {
    size: 1000,
    segments: 100,
    heightScale: 5,
    noiseScale: 0.02
};

// Add track creation constants
const TRACK = {
    width: 10,
    wallHeight: 2,
    bankingAngle: Math.PI / 12, // 15-degree banking in corners
    barriers: true
};

// Add these camera constants
const CAMERA = {
    distance: 8,          // Base distance from car
    height: 3,           // Base camera height
    lookAhead: 5,        // How far ahead to look
    smoothing: 0.1,      // Camera movement smoothing
    tiltAngle: 0.1,      // Camera tilt in turns
    fov: 75,             // Field of view
    minDistance: 6,      // Minimum distance during acceleration
    maxDistance: 10,     // Maximum distance during braking
    heightOffset: 1.5,   // Height offset from car
    dynamicFov: {
        min: 70,         // Min FOV during normal driving
        max: 85,         // Max FOV during high speeds
        speedThreshold: 1 // Speed threshold for max FOV
    }
};

// Add these functions before initGame()

function setupLighting(scene) {
    // Main directional light (sun)
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    sunLight.position.set(100, 100, 50);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 500;
    sunLight.shadow.camera.left = -100;
    sunLight.shadow.camera.right = 100;
    sunLight.shadow.camera.top = 100;
    sunLight.shadow.camera.bottom = -100;
    scene.add(sunLight);

    // Ambient light for overall illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    // Hemisphere light for sky/ground color variation
    const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x444444, 0.5);
    scene.add(hemiLight);
}

// Add this before createTrack function
let noise;

// Add this function to generate a complete circuit
function generateTrackPoints() {
    const points = [];
    const segments = TRACK.segments;

    // Create a closed loop using sine waves for variation
    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;

        // Use multiple sine waves for more interesting shapes
        const radiusVariation =
            Math.sin(angle * 2) * TRACK.variation * 0.5 +
            Math.sin(angle * 3) * TRACK.variation * 0.3 +
            Math.sin(angle * 5) * TRACK.variation * 0.2;

        const radius = TRACK.radius + radiusVariation;

        // Calculate x and z coordinates
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;

        // Add elevation changes
        const y = Math.sin(angle * 3) * TRACK.elevation +
            Math.cos(angle * 2) * TRACK.elevation * 0.5;

        points.push([x, y, z]);
    }

    // Close the loop by connecting back to start
    points.push(points[0]);

    return points;
}

// Create track function
function createTrack() {
    const track = new THREE.Group();

    // Define track waypoints for a challenging circuit
    const trackPoints = [
        [0, 0],      // Start/Finish
        [50, 0],     // First straight
        [80, 30],    // First corner
        [80, 80],    // Back straight start
        [0, 80],     // Back straight
        [-30, 80],   // Final corner start
        [-30, 30],   // Final corner mid
        [0, 0]       // Back to start
    ];

    // Create track surface
    const trackShape = new THREE.Shape();
    trackShape.moveTo(trackPoints[0][0], trackPoints[0][1]);

    for (let i = 1; i < trackPoints.length; i++) {
        trackShape.lineTo(trackPoints[i][0], trackPoints[i][1]);
    }

    // Create track geometry with extrusion
    const extrudeSettings = {
        steps: 100,
        depth: TRACK.width,
        bevelEnabled: true,
        bevelThickness: 1,
        bevelSize: 1,
        bevelSegments: 5
    };

    const trackGeometry = new THREE.ExtrudeGeometry(trackShape, extrudeSettings);
    const trackMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.7,
        metalness: 0.1
    });

    const trackMesh = new THREE.Mesh(trackGeometry, trackMaterial);
    trackMesh.receiveShadow = true;
    track.add(trackMesh);

    // Add track barriers
    if (TRACK.barriers) {
        const barrierGeometry = new THREE.BoxGeometry(1, TRACK.wallHeight, 1);
        const barrierMaterial = new THREE.MeshStandardMaterial({
            color: 0xFFFFFF,
            roughness: 0.5
        });

        // Place barriers along track points
        for (let i = 0; i < trackPoints.length - 1; i++) {
            const start = new THREE.Vector2(trackPoints[i][0], trackPoints[i][1]);
            const end = new THREE.Vector2(trackPoints[i + 1][0], trackPoints[i + 1][1]);
            const segments = 20; // Number of barrier segments between points

            for (let j = 0; j <= segments; j++) {
                const t = j / segments;
                const x = start.x + (end.x - start.x) * t;
                const z = start.y + (end.y - start.y) * t;

                // Add inner and outer barriers
                const innerBarrier = new THREE.Mesh(barrierGeometry, barrierMaterial);
                const outerBarrier = new THREE.Mesh(barrierGeometry, barrierMaterial);

                // Position barriers
                innerBarrier.position.set(x - TRACK.width/2, TRACK.wallHeight/2, z);
                outerBarrier.position.set(x + TRACK.width/2, TRACK.wallHeight/2, z);

                track.add(innerBarrier);
                track.add(outerBarrier);
            }
        }
    }

    // Add track markings
    const markingsGeometry = new THREE.PlaneGeometry(1, 4);
    const markingsMaterial = new THREE.MeshStandardMaterial({
        color: 0xFFFFFF,
        roughness: 0.9
    });

    // Place markings along track
    for (let i = 0; i < trackPoints.length - 1; i++) {
        const start = new THREE.Vector2(trackPoints[i][0], trackPoints[i][1]);
        const end = new THREE.Vector2(trackPoints[i + 1][0], trackPoints[i + 1][1]);
        const segments = 10; // Number of marking segments

        for (let j = 0; j < segments; j++) {
            const t = j / segments;
            const x = start.x + (end.x - start.x) * t;
            const z = start.y + (end.y - start.y) * t;

            const marking = new THREE.Mesh(markingsGeometry, markingsMaterial);
            marking.rotation.x = -Math.PI / 2;
            marking.position.set(x, 0.01, z); // Slightly above track surface
            track.add(marking);
        }
    }

    // Store track boundaries for collision detection
    track.boundaries = trackPoints;

    // Add start/finish line
    const startLineGeometry = new THREE.PlaneGeometry(TRACK.width, 3);
    const startLineMaterial = new THREE.MeshStandardMaterial({
        color: 0xFFFFFF,
        roughness: 0.9
    });

    const startLine = new THREE.Mesh(startLineGeometry, startLineMaterial);
    startLine.rotation.x = -Math.PI / 2;
    startLine.position.set(0, 0.02, 0); // Slightly above track surface
    track.add(startLine);

    return track;
}

// Initialize game
async function initGame() {
    try {
        // Setup basic scene
        const canvas = document.getElementById('gameCanvas');
        if (!canvas) throw new Error('Canvas not found');

        // Initialize Three.js scene
        GAME_STATE.scene = new THREE.Scene();
        GAME_STATE.scene.background = new THREE.Color(0x87CEEB);

        // Setup renderer
        GAME_STATE.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true
        });
        GAME_STATE.renderer.setSize(window.innerWidth, window.innerHeight);
        GAME_STATE.renderer.shadowMap.enabled = true;

        // Setup camera
        GAME_STATE.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        GAME_STATE.camera.position.set(0, 5, -10);

        // Add basic lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        GAME_STATE.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 10, 10);
        GAME_STATE.scene.add(directionalLight);

        // Create temporary ground
        const groundGeometry = new THREE.PlaneGeometry(100, 100);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a472a
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        GAME_STATE.scene.add(ground);

        // Create temporary car
        const carGeometry = new THREE.BoxGeometry(2, 1, 4);
        const carMaterial = new THREE.MeshStandardMaterial({
            color: 0xff0000
        });
        GAME_STATE.car = new THREE.Mesh(carGeometry, carMaterial);
        GAME_STATE.car.position.y = PHYSICS.groundLevel;
        GAME_STATE.car.castShadow = true;
        GAME_STATE.scene.add(GAME_STATE.car);

        // Setup controls
        setupControls();

        // Start game loop
        animate();

        // Setup HUD
        setupHUD();

        // Create and add track
        const track = createTrack();
        if (!track) throw new Error('Failed to create track');
        GAME_STATE.scene.add(track);
        GAME_STATE.track = track;

        // Position car at start
        GAME_STATE.car.position.set(0, PHYSICS.groundLevel, -5);
        GAME_STATE.car.rotation.y = Math.PI / 2; // Face forward

    } catch (error) {
        console.error('Failed to initialize game:', error);
        showErrorOverlay('Failed to initialize game. Please refresh the page.');
    }
}

// Setup keyboard controls
function setupControls() {
    window.addEventListener('keydown', (event) => {
        switch(event.key.toLowerCase()) {
            case 'w': case 'arrowup':
                GAME_STATE.controls.accelerate = true;
                break;
            case 's': case 'arrowdown':
                GAME_STATE.controls.brake = true;
                break;
            case 'a': case 'arrowleft':
                GAME_STATE.controls.turnLeft = true;
                break;
            case 'd': case 'arrowright':
                GAME_STATE.controls.turnRight = true;
                break;
            case ' ':
                GAME_STATE.controls.handbrake = true;
                break;
        }
    });

    window.addEventListener('keyup', (event) => {
        switch(event.key.toLowerCase()) {
            case 'w': case 'arrowup':
                GAME_STATE.controls.accelerate = false;
                break;
            case 's': case 'arrowdown':
                GAME_STATE.controls.brake = false;
                break;
            case 'a': case 'arrowleft':
                GAME_STATE.controls.turnLeft = false;
                break;
            case 'd': case 'arrowright':
                GAME_STATE.controls.turnRight = false;
                break;
            case ' ':
                GAME_STATE.controls.handbrake = false;
                break;
        }
    });
}

// Game loop
function animate() {
    requestAnimationFrame(animate);

    if (!GAME_STATE.scene || !GAME_STATE.camera || !GAME_STATE.renderer) return;

    updateCarPhysics();
    updateCamera();
    updateHUD();

    GAME_STATE.renderer.render(GAME_STATE.scene, GAME_STATE.camera);
}

// Update car physics
function updateCarPhysics() {
    if (!GAME_STATE.car) return;

    // Handle acceleration
    if (GAME_STATE.controls.accelerate) {
        GAME_STATE.carSpeed += PHYSICS.acceleration;
    }
    if (GAME_STATE.controls.brake) {
        GAME_STATE.carSpeed -= PHYSICS.braking;
    }

    // Natural deceleration
    if (!GAME_STATE.controls.accelerate && !GAME_STATE.controls.brake) {
        GAME_STATE.carSpeed *= (1 - PHYSICS.deceleration);
    }

    // Speed limits
    GAME_STATE.carSpeed = Math.max(-PHYSICS.maxSpeed,
        Math.min(PHYSICS.maxSpeed, GAME_STATE.carSpeed));

    // Update car position
    const direction = new THREE.Vector3();
    GAME_STATE.car.getWorldDirection(direction);
    GAME_STATE.car.position.add(
        direction.multiplyScalar(GAME_STATE.carSpeed)
    );

    // Handle turning
    if (GAME_STATE.controls.turnLeft) {
        GAME_STATE.car.rotation.y += PHYSICS.turnSpeed;
    }
    if (GAME_STATE.controls.turnRight) {
        GAME_STATE.car.rotation.y -= PHYSICS.turnSpeed;
    }
}

// Update camera position
function updateCamera() {
    if (!GAME_STATE.car || !GAME_STATE.camera) return;

    const cameraOffset = new THREE.Vector3(0, 3, -7);
    cameraOffset.applyQuaternion(GAME_STATE.car.quaternion);
    GAME_STATE.camera.position.copy(GAME_STATE.car.position).add(cameraOffset);
    GAME_STATE.camera.lookAt(GAME_STATE.car.position);
}

// Setup HUD elements
function setupHUD() {
    const overlay = document.getElementById('overlay');
    if (!overlay) return;

    overlay.innerHTML = `
        <div id="speedometer">0 km/h</div>
        <div id="lap-counter">Lap: 1/3</div>
        <div id="fps-counter">FPS: 0</div>
        <div id="mini-map">
            <canvas id="mini-map-canvas"></canvas>
        </div>
    `;

    // Setup mini-map canvas
    const miniMapCanvas = document.getElementById('mini-map-canvas');
    miniMapCanvas.width = GAME_STATE.miniMap.size;
    miniMapCanvas.height = GAME_STATE.miniMap.size;
}

// Update HUD
function updateHUD() {
    // Update speedometer
    const speedEl = document.getElementById('speedometer');
    if (speedEl) {
        speedEl.textContent = `${Math.abs(Math.round(GAME_STATE.carSpeed * 100))} km/h`;
    }

    // Calculate and update FPS
    GAME_STATE.frameCount++;
    const currentTime = performance.now();
    const deltaTime = currentTime - GAME_STATE.lastTime;

    if (deltaTime >= 1000) {
        GAME_STATE.fps = Math.round((GAME_STATE.frameCount * 1000) / deltaTime);
        GAME_STATE.frameCount = 0;
        GAME_STATE.lastTime = currentTime;

        const fpsEl = document.getElementById('fps-counter');
        if (fpsEl) {
            fpsEl.textContent = `FPS: ${GAME_STATE.fps}`;
        }
    }

    // Update mini-map
    updateMiniMap();
}

// Add mini-map update function
function updateMiniMap() {
    const miniMapCanvas = document.getElementById('mini-map-canvas');
    if (!miniMapCanvas) return;

    const ctx = miniMapCanvas.getContext('2d');
    const size = GAME_STATE.miniMap.size;

    // Clear mini-map
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, size, size);

    // Draw track
    if (GAME_STATE.track && GAME_STATE.track.boundaries) {
        ctx.beginPath();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;

        const boundaries = GAME_STATE.track.boundaries;
        const scale = GAME_STATE.miniMap.scale;
        const centerX = size / 2;
        const centerY = size / 2;

        // Draw track outline
        ctx.moveTo(
            centerX + boundaries[0][0] * scale,
            centerY + boundaries[0][1] * scale
        );

        for (let i = 1; i < boundaries.length; i++) {
            ctx.lineTo(
                centerX + boundaries[i][0] * scale,
                centerY + boundaries[i][1] * scale
            );
        }

        ctx.stroke();
    }

    // Draw car position
    if (GAME_STATE.car) {
        const carX = (size / 2) + GAME_STATE.car.position.x * GAME_STATE.miniMap.scale;
        const carY = (size / 2) + GAME_STATE.car.position.z * GAME_STATE.miniMap.scale;

        ctx.beginPath();
        ctx.fillStyle = '#FF0000';
        ctx.arc(carX, carY, 3, 0, Math.PI * 2);
        ctx.fill();

        // Draw car direction
        const direction = new THREE.Vector3();
        GAME_STATE.car.getWorldDirection(direction);
        ctx.beginPath();
        ctx.strokeStyle = '#FF0000';
        ctx.moveTo(carX, carY);
        ctx.lineTo(
            carX + direction.x * 10,
            carY + direction.z * 10
        );
        ctx.stroke();
    }
}

// Start the game
window.addEventListener('load', initGame);

// Helper function to show errors to user
function showErrorOverlay(message) {
    const overlay = document.getElementById('overlay');
    if (overlay) {
        overlay.innerHTML = `
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                        color: white; background: rgba(255,0,0,0.8); padding: 20px; border-radius: 5px;
                        text-align: center; max-width: 80%;">
                <h3>Error</h3>
                <p>${message}</p>
                <button onclick="location.reload()" style="margin-top: 10px; padding: 5px 10px;">
                    Reload Game
                </button>
            </div>
        `;
    }
}

// Split scene creation into its own function
function createScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue background
    scene.fog = new THREE.Fog(0x87CEEB, 20, 100);
    return scene;
}

// Split renderer creation into its own function
function createRenderer(canvas) {
    try {
        const renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x87CEEB);
        renderer.shadowMap.enabled = true;
        return renderer;
    } catch (error) {
        debugLog('Failed to create renderer', 'error', error);
        return null;
    }
}

// Split camera creation into its own function
function createCamera() {
    try {
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 3, 10);
        camera.lookAt(0, 0, 0);
        return camera;
    } catch (error) {
        debugLog('Failed to create camera', 'error', error);
        return null;
    }
}

// Add this function to check track boundaries
function checkTrackBoundaries(car, track) {
    const carPosition = new THREE.Vector2(car.position.x, car.position.z);
    const boundaries = track.boundaries;
    let isInsideTrack = false;

    // Check if car is within track boundaries using ray casting
    for (let i = 0, j = boundaries.length - 1; i < boundaries.length; j = i++) {
        const point1 = boundaries[i];
        const point2 = boundaries[j];

        if (((point1[1] > carPosition.y) !== (point2[1] > carPosition.y)) &&
            (carPosition.x < (point2[0] - point1[0]) * (carPosition.y - point1[1]) /
                (point2[1] - point1[1]) + point1[0])) {
            isInsideTrack = !isInsideTrack;
        }
    }

    // If outside track, apply correction
    if (!isInsideTrack) {
        // Reduce speed
        GAME_STATE.carSpeed *= 0.5;

        // Find nearest point on track and push car towards it
        let nearestPoint = boundaries[0];
        let minDistance = Infinity;

        for (const point of boundaries) {
            const distance = Math.sqrt(
                Math.pow(point[0] - carPosition.x, 2) +
                Math.pow(point[1] - carPosition.y, 2)
            );
            if (distance < minDistance) {
                minDistance = distance;
                nearestPoint = point;
            }
        }

        // Push car towards track
        car.position.x += (nearestPoint[0] - carPosition.x) * 0.1;
        car.position.z += (nearestPoint[1] - carPosition.y) * 0.1;

        return false;
    }

    return true;
}

function updateGame() {
    // Existing update code...

    // Add this after updating car position
    if (!checkTrackBoundaries(GAME_STATE.car, GAME_STATE.track)) {
        debugLog('Car outside track boundaries', 'warn');
    }

    // Rest of update code...
}

// Add these functions before getGroundSurfaceAt

function isOnTrack(position, track) {
    // Get track boundaries
    const boundaries = track.boundaries;
    if (!boundaries) return false;

    // Find nearest point on track
    let nearestPoint = boundaries[0];
    let minDistance = Infinity;

    for (const point of boundaries) {
        const distance = Math.sqrt(
            Math.pow(point[0] - position.x, 2) +
            Math.pow(point[1] - position.z, 2)
        );
        if (distance < minDistance) {
            minDistance = distance;
            nearestPoint = point;
        }
    }

    // Consider the car on track if within threshold distance
    const ON_TRACK_THRESHOLD = 5; // Adjust this value based on track width
    return minDistance <= ON_TRACK_THRESHOLD;
}

function isInGravelTrap(position, track) {
    // For now, consider areas just outside track as gravel
    const boundaries = track.boundaries;
    if (!boundaries) return false;

    let nearestPoint = boundaries[0];
    let minDistance = Infinity;

    for (const point of boundaries) {
        const distance = Math.sqrt(
            Math.pow(point[0] - position.x, 2) +
            Math.pow(point[1] - position.z, 2)
        );
        if (distance < minDistance) {
            minDistance = distance;
            nearestPoint = point;
        }
    }

    // Consider it gravel if just outside track but not too far
    const GRAVEL_MIN = 5;  // Same as ON_TRACK_THRESHOLD
    const GRAVEL_MAX = 8;  // Adjust based on desired gravel trap width
    return minDistance > GRAVEL_MIN && minDistance <= GRAVEL_MAX;
}

// The existing getGroundSurfaceAt function can now use these helpers
function getGroundSurfaceAt(position) {
    if (isOnTrack(position, GAME_STATE.track)) {
        return 'track';
    }
    if (isInGravelTrap(position, GAME_STATE.track)) {
        return 'gravel';
    }
    return 'grass';
}

// Helper function to get surface normal
function getSurfaceNormal(position) {
    const sampleDistance = 0.5; // Distance between sample points
    const points = [
        getSurfaceHeight(position.x - sampleDistance, position.z),
        getSurfaceHeight(position.x + sampleDistance, position.z),
        getSurfaceHeight(position.x, position.z - sampleDistance),
        getSurfaceHeight(position.x, position.z + sampleDistance)
    ];

    // Calculate normal from height differences
    const normal = new THREE.Vector3(
        (points[0] - points[1]) / (2 * sampleDistance),
        1,
        (points[2] - points[3]) / (2 * sampleDistance)
    ).normalize();

    return normal;
}

// Helper function to get surface height at a point
function getSurfaceHeight(x, z) {
    if (!GAME_STATE.track) return 0;

    const raycaster = new THREE.Raycaster();
    raycaster.set(
        new THREE.Vector3(x, 100, z),
        new THREE.Vector3(0, -1, 0)
    );

    const intersects = raycaster.intersectObject(GAME_STATE.track, true);
    return intersects.length > 0 ? intersects[0].point.y : 0;
}