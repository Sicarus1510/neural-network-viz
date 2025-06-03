// src/js/main.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { NeuralNetwork } from './core/NeuralNetwork.js';
import { ParticleSystem } from './core/ParticleSystem.js';
import { PostProcessing } from './core/PostProcessing.js';
import { Performance } from './utils/Performance.js';
import { ResourceManager } from './utils/ResourceManager.js';

// Dynamic import for GUI (only in development)
let GUI = null;
if (import.meta.env.DEV) {
    import('tweakpane').then(module => {
        GUI = module.Pane;
    });
}

class NeuralNetworkApp {
    constructor() {
        this.canvas = document.querySelector('#webgl-canvas');
        this.loadingScreen = document.querySelector('#loading');
        
        if (!this.canvas) {
            throw new Error('Canvas element not found');
        }
        
        // Viewport settings
        this.sizes = {
            width: window.innerWidth,
            height: window.innerHeight,
            pixelRatio: Math.min(window.devicePixelRatio, 2)
        };
        
        // Interaction state
        this.mouse = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();
        this.clock = new THREE.Clock();
        
        // Visual parameters
        this.params = {
            // Animation
            animationSpeed: 1.0,
            rotationSpeed: 0.2,
            pulseSpeed: 3.0,
            
            // Visual effects
            glowIntensity: 2.0,
            particleSize: 1.0,
            particleCount: 10000,
            
            // Scale
            networkScale: 1.0,
            
            // Post-processing
            bloomStrength: 2.0,
            bloomRadius: 0.6,
            bloomThreshold: 0.5,
            chromaticAberration: 0.002,
            vignetteIntensity: 0.4,
            
            // Interaction
            enableInteraction: true,
            autoRotate: true,
            
            // Advanced settings
            refractionPower: 0.3,
            crystalOpacity: 0.9,
            energyFlowSpeed: 1.0
        };
        
        // Application state
        this.initialized = false;
        this.animationId = null;
        this.paused = false;
        this.targetRotation = 0;
        this.currentRotation = 0;
        
        // Components
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;
        this.neuralNetwork = null;
        this.particleSystem = null;
        this.postProcessing = null;
        this.performance = null;
        this.resources = null;
        this.gui = null;
        
        // Environment
        this.cubeRenderTarget = null;
        this.cubeCamera = null;
        
        console.log('🧠 Neural Network Visualization initializing...');
        this.init();
    }
    
    async init() {
        try {
            console.log('=== Initialization Started ===');
            
            // Show loading screen
            this.showLoadingScreen('Initializing WebGL...');
            
            // Initialize performance monitoring
            this.performance = new Performance();
            
            // Setup core Three.js components
            await this.setupRenderer();
            this.setupScene();
            this.setupCamera();
            this.setupLighting();
            this.setupEnvironment();
            this.setupControls();
            
            // Load resources
            this.updateLoadingMessage('Loading textures and shaders...');
            this.resources = new ResourceManager();
            
            const textures = await this.resources.loadTextures({
                particle: './textures/particle.png',
                noise: './textures/noise.png',
                gradient: './textures/gradient.png'
            });
            
            // Create neural network visualization
            this.updateLoadingMessage('Constructing neural network...');
            this.neuralNetwork = new NeuralNetwork(this.scene, this.params);
            await this.neuralNetwork.init();
            
            // Apply environment map to neural network
            if (this.cubeRenderTarget) {
                this.neuralNetwork.octagonFrame.material.uniforms.uEnvMap.value = 
                    this.cubeRenderTarget.texture;
            }
            
            // Create particle system
            this.updateLoadingMessage('Initializing particle system...');
            this.particleSystem = new ParticleSystem(
                this.scene,
                this.neuralNetwork.getNodePositions(),
                textures.particle || this.createFallbackParticleTexture(),
                this.params,
                this.neuralNetwork
            );
            
            // Setup post-processing
            this.updateLoadingMessage('Setting up visual effects...');
            this.postProcessing = new PostProcessing(
                this.renderer,
                this.scene,
                this.camera,
                this.params
            );
            
            // Setup GUI (development only)
            if (GUI && import.meta.env.DEV) {
                await this.setupGUI();
            }
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Final setup
            this.updateLoadingMessage('Finalizing...');
            await this.delay(500); // Brief pause for dramatic effect
            
            // Mark as initialized
            this.initialized = true;
            
            // Hide loading screen with fade
            this.hideLoadingScreen();
            
            // Start animation loop
            this.animate();
            
            // Send ready message if in iframe
            if (window.parent !== window) {
                window.parent.postMessage({ type: 'ready' }, '*');
            }
            
            console.log('=== Initialization Complete ===');
            
        } catch (error) {
            console.error('=== Initialization Failed ===');
            console.error(error);
            this.handleError(error);
        }
    }
    
    async setupRenderer() {
        try {
            // Check WebGL support
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            if (!gl) {
                throw new Error('WebGL is not supported on this device');
            }
            
            this.renderer = new THREE.WebGLRenderer({
                canvas: this.canvas,
                antialias: true,
                powerPreference: 'high-performance',
                alpha: false,
                stencil: false,
                depth: true
            });
            
            this.renderer.setSize(this.sizes.width, this.sizes.height);
            this.renderer.setPixelRatio(this.sizes.pixelRatio);
            
            // Advanced renderer settings
            this.renderer.outputEncoding = THREE.sRGBEncoding;
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.2;
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            
            // Enable advanced features if available
            const capabilities = this.renderer.capabilities;
            console.log(`WebGL${capabilities.isWebGL2 ? '2' : ''} initialized`);
            console.log(`Max texture size: ${capabilities.maxTextureSize}`);
            console.log(`Max anisotropy: ${capabilities.getMaxAnisotropy()}`);
            
        } catch (error) {
            throw new Error(`Renderer initialization failed: ${error.message}`);
        }
    }
    
    setupScene() {
        this.scene = new THREE.Scene();
        
        // Dark blue-black background for space feel
        this.scene.background = new THREE.Color(0x000511);
        
        // Exponential fog for depth
        this.scene.fog = new THREE.FogExp2(0x000511, 0.015);
    }
    
    setupCamera() {
        // Perspective camera with cinematic FOV
        this.camera = new THREE.PerspectiveCamera(
            45,
            this.sizes.width / this.sizes.height,
            0.1,
            100
        );
        
        // Position for optimal view
        this.camera.position.set(0, 5, 20);
        this.camera.lookAt(0, 0, 0);
        
        this.scene.add(this.camera);
    }
    
    setupLighting() {
        // Subtle ambient light
        const ambientLight = new THREE.AmbientLight(0x0a0a1a, 0.5);
        this.scene.add(ambientLight);
        
        // Key light - bright cyan
        const keyLight = new THREE.PointLight(0x00ffff, 3, 25);
        keyLight.position.set(10, 10, 10);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 1024;
        keyLight.shadow.mapSize.height = 1024;
        this.scene.add(keyLight);
        
        // Fill light - deep blue
        const fillLight = new THREE.PointLight(0x0044ff, 2, 20);
        fillLight.position.set(-10, -5, -10);
        this.scene.add(fillLight);
        
        // Rim light - white
        const rimLight = new THREE.PointLight(0xffffff, 1, 15);
        rimLight.position.set(0, -10, 0);
        this.scene.add(rimLight);
        
        // Add light helpers in development
        if (import.meta.env.DEV) {
            // Uncomment to see light positions
            // this.scene.add(new THREE.PointLightHelper(keyLight, 0.5));
            // this.scene.add(new THREE.PointLightHelper(fillLight, 0.5));
            // this.scene.add(new THREE.PointLightHelper(rimLight, 0.5));
        }
    }
    
    setupEnvironment() {
        // Create cube render target for reflections
        this.cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, {
            format: THREE.RGBFormat,
            generateMipmaps: true,
            minFilter: THREE.LinearMipmapLinearFilter,
            encoding: THREE.sRGBEncoding
        });
        
        this.cubeCamera = new THREE.CubeCamera(0.1, 100, this.cubeRenderTarget);
        this.scene.add(this.cubeCamera);
        
        // Create environment sphere for reflections
        const envGeometry = new THREE.SphereGeometry(50, 32, 32);
        const envMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 }
            },
            vertexShader: `
                varying vec3 vPosition;
                void main() {
                    vPosition = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uTime;
                varying vec3 vPosition;
                
                void main() {
                    float y = normalize(vPosition).y;
                    
                    // Gradient from dark bottom to lighter top
                    vec3 bottomColor = vec3(0.0, 0.02, 0.05);
                    vec3 topColor = vec3(0.0, 0.1, 0.2);
                    vec3 color = mix(bottomColor, topColor, y * 0.5 + 0.5);
                    
                    // Add some stars
                    float stars = step(0.998, fract(sin(dot(vPosition.xy, vec2(12.9898, 78.233))) * 43758.5453));
                    color += vec3(stars);
                    
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            side: THREE.BackSide
        });
        
        const envSphere = new THREE.Mesh(envGeometry, envMaterial);
        this.scene.add(envSphere);
    }
    
    setupControls() {
        this.controls = new OrbitControls(this.camera, this.canvas);
        
        // Smooth controls
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        
        // Limits
        this.controls.minDistance = 10;
        this.controls.maxDistance = 40;
        this.controls.maxPolarAngle = Math.PI * 0.9;
        this.controls.minPolarAngle = Math.PI * 0.1;
        
        // Auto-rotation
        this.controls.autoRotate = this.params.autoRotate;
        this.controls.autoRotateSpeed = this.params.rotationSpeed;
        
        // Disable pan for cleaner interaction
        this.controls.enablePan = false;
        
        // Touch settings
        this.controls.touches = {
            ONE: THREE.TOUCH.ROTATE,
            TWO: THREE.TOUCH.DOLLY_ROTATE
        };
    }
    
    async setupGUI() {
        if (!GUI) return;
        
        this.gui = new GUI({
            title: 'Neural Network Controls',
            expanded: window.innerWidth > 1024
        });
        
        // Animation folder
        const animFolder = this.gui.addFolder({
            title: 'Animation',
            expanded: true
        });
        
        animFolder.addInput(this.params, 'animationSpeed', {
            min: 0,
            max: 3,
            step: 0.1,
            label: 'Speed'
        });
        
        animFolder.addInput(this.params, 'rotationSpeed', {
            min: 0,
            max: 2,
            step: 0.1,
            label: 'Rotation'
        }).on('change', (ev) => {
            this.controls.autoRotateSpeed = ev.value;
        });
        
        animFolder.addInput(this.params, 'autoRotate', {
            label: 'Auto Rotate'
        }).on('change', (ev) => {
            this.controls.autoRotate = ev.value;
        });
        
        // Visual effects folder
        const visualFolder = this.gui.addFolder({
            title: 'Visual Effects',
            expanded: true
        });
        
        visualFolder.addInput(this.params, 'glowIntensity', {
            min: 0,
            max: 5,
            step: 0.1,
            label: 'Glow'
        });
        
        visualFolder.addInput(this.params, 'particleSize', {
            min: 0.5,
            max: 3,
            step: 0.1,
            label: 'Particle Size'
        });
        
        visualFolder.addInput(this.params, 'crystalOpacity', {
            min: 0.5,
            max: 1,
            step: 0.05,
            label: 'Crystal Opacity'
        });
        
        // Post-processing folder
        const postFolder = this.gui.addFolder({
            title: 'Post Processing',
            expanded: false
        });
        
        postFolder.addInput(this.params, 'bloomStrength', {
            min: 0,
            max: 4,
            step: 0.1,
            label: 'Bloom Strength'
        });
        
        postFolder.addInput(this.params, 'bloomRadius', {
            min: 0,
            max: 1,
            step: 0.05,
            label: 'Bloom Radius'
        });
        
        postFolder.addInput(this.params, 'bloomThreshold', {
            min: 0,
            max: 1,
            step: 0.05,
            label: 'Bloom Threshold'
        });
        
        postFolder.addInput(this.params, 'chromaticAberration', {
            min: 0,
            max: 0.01,
            step: 0.0001,
            label: 'Chromatic'
        });
        
        postFolder.addInput(this.params, 'vignetteIntensity', {
            min: 0,
            max: 1,
            step: 0.05,
            label: 'Vignette'
        });
        
        // Advanced folder
        const advancedFolder = this.gui.addFolder({
            title: 'Advanced',
            expanded: false
        });
        
        advancedFolder.addInput(this.params, 'refractionPower', {
            min: 0,
            max: 1,
            step: 0.05,
            label: 'Refraction'
        });
        
        advancedFolder.addInput(this.params, 'particleCount', {
            min: 1000,
            max: 20000,
            step: 1000,
            label: 'Particles'
        });
        
        // Stats button
        this.gui.addButton({
            title: 'Toggle Stats'
        }).on('click', () => {
            if (this.performance) {
                this.performance.togglePanel();
            }
        });
        
        // Update all components when parameters change
        this.gui.on('change', () => {
            this.updateAllParams();
        });
    }
    
    setupEventListeners() {
        // Window resize
        window.addEventListener('resize', () => this.handleResize(), { passive: true });
        
        // Mouse/touch interaction
        this.canvas.addEventListener('pointermove', (e) => this.handlePointerMove(e), { passive: true });
        this.canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e), { passive: true });
        this.canvas.addEventListener('pointerup', (e) => this.handlePointerUp(e), { passive: true });
        
        // Keyboard controls
        window.addEventListener('keydown', (e) => this.handleKeyDown(e), { passive: true });
        
        // Page visibility
        document.addEventListener('visibilitychange', () => this.handleVisibilityChange(), { passive: true });
        
        // Message API for iframe communication
        window.addEventListener('message', (e) => this.handleMessage(e), { passive: true });
        
        // Performance optimization - reduce quality on low FPS
        let lowFPSCount = 0;
        setInterval(() => {
            if (this.performance && this.performance.fps < 30) {
                lowFPSCount++;
                if (lowFPSCount > 10 && this.sizes.pixelRatio > 1) {
                    console.log('Reducing quality for better performance');
                    this.sizes.pixelRatio = 1;
                    this.renderer.setPixelRatio(1);
                    lowFPSCount = 0;
                }
            } else {
                lowFPSCount = 0;
            }
        }, 1000);
    }
    
    handleResize() {
        // Update sizes
        this.sizes.width = window.innerWidth;
        this.sizes.height = window.innerHeight;
        
        // Update camera
        this.camera.aspect = this.sizes.width / this.sizes.height;
        this.camera.updateProjectionMatrix();
        
        // Update renderer
        this.renderer.setSize(this.sizes.width, this.sizes.height);
        this.renderer.setPixelRatio(this.sizes.pixelRatio);
        
        // Update post-processing
        if (this.postProcessing) {
            this.postProcessing.setSize(this.sizes.width, this.sizes.height);
        }
    }
    
    handlePointerMove(event) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        if (this.particleSystem) {
            this.particleSystem.updateMousePosition(this.mouse);
        }
    }
    
    handlePointerDown(event) {
        if (!this.params.enableInteraction) return;
        
        // Raycast to find intersections
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        const interactiveObjects = this.neuralNetwork?.getInteractiveObjects() || [];
        const intersects = this.raycaster.intersectObjects(interactiveObjects);
        
        if (intersects.length > 0) {
            const point = intersects[0].point;
            
            // Trigger effects
            if (this.neuralNetwork) {
                this.neuralNetwork.triggerPulse(point);
            }
            
            if (this.particleSystem) {
                this.particleSystem.triggerBurst(point);
            }
            
            // Visual feedback
            this.createClickEffect(point);
            
            // Send interaction event if in iframe
            if (window.parent !== window) {
                window.parent.postMessage({
                    type: 'interaction',
                    data: {
                        point: point.toArray(),
                        object: intersects[0].object.name
                    }
                }, '*');
            }
        }
    }
    
    handlePointerUp(event) {
        // Could be used for drag end events
    }
    
    handleKeyDown(event) {
        switch(event.key.toLowerCase()) {
            case ' ':
                this.paused = !this.paused;
                console.log(this.paused ? 'Paused' : 'Resumed');
                break;
            case 'f':
                this.toggleFullscreen();
                break;
            case 's':
                this.captureScreenshot();
                break;
            case 'g':
                if (this.gui) {
                    this.gui.hidden = !this.gui.hidden;
                }
                break;
        }
    }
    
    handleVisibilityChange() {
        this.paused = document.hidden;
    }
    
    handleMessage(event) {
        if (!event.data || !event.data.type) return;
        
        switch (event.data.type) {
            case 'updateParams':
                if (event.data.params) {
                    Object.assign(this.params, event.data.params);
                    this.updateAllParams();
                }
                break;
            case 'pause':
                this.paused = true;
                break;
            case 'resume':
                this.paused = false;
                break;
            case 'screenshot':
                this.captureScreenshot();
                break;
        }
    }
    
    updateAllParams() {
        // Update all components with new parameters
        if (this.neuralNetwork) {
            this.neuralNetwork.updateParams(this.params);
        }
        
        if (this.particleSystem) {
            this.particleSystem.updateParams(this.params);
        }
        
        if (this.postProcessing) {
            this.postProcessing.updateParams(this.params);
        }
    }
    
    createClickEffect(position) {
        // Create a visual feedback for clicks
        const geometry = new THREE.SphereGeometry(0.5, 16, 16);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.8
        });
        
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.copy(position);
        this.scene.add(sphere);
        
        // Animate and remove
        const startTime = Date.now();
        const animate = () => {
            const elapsed = (Date.now() - startTime) / 1000;
            const scale = 1 + elapsed * 3;
            sphere.scale.setScalar(scale);
            sphere.material.opacity = Math.max(0, 0.8 - elapsed * 2);
            
            if (elapsed < 0.5) {
                requestAnimationFrame(animate);
            } else {
                this.scene.remove(sphere);
                geometry.dispose();
                material.dispose();
            }
        };
        animate();
    }
    
    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }
    
    captureScreenshot() {
        // Render one frame
        if (this.postProcessing && this.postProcessing.enabled) {
            this.postProcessing.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
        
        // Capture canvas
        this.canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `neural-network-${Date.now()}.png`;
            a.click();
            URL.revokeObjectURL(url);
        }, 'image/png');
        
        console.log('Screenshot captured');
    }
    
    updateLoadingMessage(message) {
        const loadingText = this.loadingScreen?.querySelector('p');
        if (loadingText) {
            loadingText.textContent = message;
        }
    }
    
    showLoadingScreen(message) {
        if (this.loadingScreen) {
            this.loadingScreen.style.display = 'flex';
            this.loadingScreen.classList.remove('hidden');
            this.updateLoadingMessage(message);
        }
    }
    
    hideLoadingScreen() {
        if (this.loadingScreen) {
            this.loadingScreen.classList.add('hidden');
            setTimeout(() => {
                this.loadingScreen.style.display = 'none';
            }, 500);
        }
    }
    
    createFallbackParticleTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        
        // Create sophisticated gradient
        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.2, 'rgba(200, 230, 255, 0.9)');
        gradient.addColorStop(0.4, 'rgba(100, 200, 255, 0.6)');
        gradient.addColorStop(0.7, 'rgba(0, 150, 255, 0.3)');
        gradient.addColorStop(1, 'rgba(0, 100, 255, 0)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);
        
        // Add glow ring
        ctx.strokeStyle = 'rgba(0, 200, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(32, 32, 20, 0, Math.PI * 2);
        ctx.stroke();
        
        return new THREE.CanvasTexture(canvas);
    }
    
    handleError(error) {
        console.error('Critical error:', error);
        
        // Hide loading screen
        if (this.loadingScreen) {
            this.loadingScreen.style.display = 'none';
        }
        
        // Create error display
        const errorContainer = document.createElement('div');
        errorContainer.className = 'error-container';
        errorContainer.innerHTML = `
            <div class="error-content">
                <h2>⚠️ Initialization Error</h2>
                <p>${error.message}</p>
                <p class="error-hint">Please try refreshing the page or using a different browser.</p>
                <button onclick="location.reload()">Reload Page</button>
            </div>
        `;
        
        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .error-container {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 5, 17, 0.95);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                backdrop-filter: blur(10px);
            }
            .error-content {
                background: rgba(0, 0, 0, 0.8);
                border: 1px solid #ff3366;
                border-radius: 10px;
                padding: 30px;
                max-width: 500px;
                text-align: center;
                color: white;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            .error-content h2 {
                color: #ff3366;
                margin: 0 0 15px 0;
            }
            .error-content p {
                margin: 10px 0;
                line-height: 1.5;
            }
            .error-hint {
                font-size: 0.9em;
                opacity: 0.7;
            }
            .error-content button {
                margin-top: 20px;
                padding: 10px 30px;
                background: #0088ff;
                color: white;
                border: none;
                border-radius: 5px;
                font-size: 16px;
                cursor: pointer;
                transition: background 0.3s;
            }
            .error-content button:hover {
                background: #0066cc;
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(errorContainer);
        
        // Report error if in iframe
        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'error',
                message: error.message
            }, '*');
        }
    }
    
    animate() {
        if (!this.initialized) return;
        
        this.animationId = requestAnimationFrame(() => this.animate());
        
        // Skip if paused
        if (this.paused) return;
        
        // Performance monitoring
        if (this.performance) {
            this.performance.begin();
        }
        
        const deltaTime = Math.min(this.clock.getDelta(), 0.1);
        const elapsedTime = this.clock.getElapsedTime();
        
        // Update controls
        if (this.controls) {
            this.controls.update();
        }
        
        // Update environment cube camera (for reflections)
        if (this.cubeCamera && this.neuralNetwork) {
            this.neuralNetwork.group.visible = false;
            this.cubeCamera.update(this.renderer, this.scene);
            this.neuralNetwork.group.visible = true;
            
            // Update neural network material with fresh environment
            if (this.neuralNetwork.octagonFrame) {
                this.neuralNetwork.octagonFrame.material.uniforms.uEnvMap.value = 
                    this.cubeRenderTarget.texture;
            }
        }
        
        // Update neural network
        if (this.neuralNetwork) {
            this.neuralNetwork.update(elapsedTime, deltaTime);
        }
        
        // Update particle system
        if (this.particleSystem) {
            this.particleSystem.update(elapsedTime, deltaTime);
        }
        
        // Render scene
        if (this.postProcessing && this.postProcessing.enabled) {
            this.postProcessing.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
        
        // Performance monitoring
        if (this.performance) {
            this.performance.end();
        }
    }
    
    // Utility functions
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    dispose() {
        console.log('Disposing Neural Network App...');
        
        // Cancel animation
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        // Dispose components
        if (this.neuralNetwork) this.neuralNetwork.dispose();
        if (this.particleSystem) this.particleSystem.dispose();
        if (this.postProcessing) this.postProcessing.dispose();
        if (this.resources) this.resources.dispose();
        
        // Dispose Three.js objects
        if (this.scene) {
            this.scene.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }
        
        // Dispose renderer
        if (this.renderer) {
            this.renderer.dispose();
        }
        
        // Dispose cube render target
        if (this.cubeRenderTarget) {
            this.cubeRenderTarget.dispose();
        }
        
        // Dispose GUI
        if (this.gui) {
            this.gui.dispose();
        }
        
        // Remove event listeners
        window.removeEventListener('resize', this.handleResize);
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('message', this.handleMessage);
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        
        console.log('Disposal complete');
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.neuralNetworkApp = new NeuralNetworkApp();
    });
} else {
    window.neuralNetworkApp = new NeuralNetworkApp();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.neuralNetworkApp) {
        window.neuralNetworkApp.dispose();
    }
});

// Hot module replacement support (Vite)
if (import.meta.hot) {
    import.meta.hot.accept(() => {
        if (window.neuralNetworkApp) {
            window.neuralNetworkApp.dispose();
        }
        window.neuralNetworkApp = new NeuralNetworkApp();
    });
}