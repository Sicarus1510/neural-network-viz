import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { NeuralNetwork } from './core/NeuralNetwork.js';
import { ParticleSystem } from './core/ParticleSystem.js';
import { PostProcessing } from './core/PostProcessing.js';
import { Performance } from './utils/Performance.js';
import { ResourceManager } from './utils/ResourceManager.js';

// Dynamic import for Tweakpane to prevent build issues
let Pane = null;

class NeuralNetworkApp {
    constructor() {
        this.canvas = document.querySelector('#webgl-canvas');
        this.loadingScreen = document.querySelector('#loading');
        
        if (!this.canvas) {
            throw new Error('Canvas element not found');
        }
        
        this.sizes = {
            width: window.innerWidth,
            height: window.innerHeight,
            pixelRatio: Math.min(window.devicePixelRatio, 2)
        };
        
        this.mouse = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();
        this.clock = new THREE.Clock();
        
        this.params = {
            animationSpeed: 1.0,
            glowIntensity: 1.8,
            particleSize: 3.5,
            particleCount: 8000,
            networkScale: 1.0,
            rotationSpeed: 0.15,
            pulseSpeed: 2.5,
            enableInteraction: true,
            bloomStrength: 1.8,
            bloomRadius: 0.5,
            bloomThreshold: 0.7
        };
        
        // Initialize flags
        this.initialized = false;
        this.animationId = null;
        
        console.log('Neural Network App initialized');
        this.init();
    }
    
    async init() {
        try {
            console.log('=== Starting initialization ===');
            this.updateLoadingMessage('Initializing renderer...');
            
            // Initialize performance monitoring
            this.performance = new Performance();
            console.log('✓ Performance monitoring initialized');
            
            // Setup basic Three.js components
            this.setupRenderer();
            console.log('✓ Renderer setup complete');
            
            this.setupScene();
            console.log('✓ Scene setup complete');
            
            this.setupCamera();
            console.log('✓ Camera setup complete');
            
            this.setupControls();
            console.log('✓ Controls setup complete');
            
            // Initialize resource manager
            this.updateLoadingMessage('Loading textures...');
            this.resources = new ResourceManager();
            
            try {
                await this.resources.loadTextures({
                    particle: './textures/particle.png'  // Changed to relative path
                });
                console.log('✓ Textures loaded successfully');
            } catch (textureError) {
                console.warn('Texture loading failed, using fallback:', textureError);
                // ResourceManager already provides fallback texture
            }
            
            // Create neural network visualization
            this.updateLoadingMessage('Creating neural network...');
            this.neuralNetwork = new NeuralNetwork(this.scene, this.params);
            await this.neuralNetwork.init();
            console.log('✓ Neural network initialized');
            
            // Verify we have node positions
            const nodePositions = this.neuralNetwork.getNodePositions();
            if (!nodePositions || nodePositions.length === 0) {
                throw new Error('No node positions available from neural network');
            }
            console.log(`✓ ${nodePositions.length} node positions created`);
            
            // Create particle system
            this.updateLoadingMessage('Creating particle system...');
            this.particleSystem = new ParticleSystem(
            this.scene,
            nodePositions,
            this.resources.textures.particle || this.createFallbackTexture(),
            this.params,
            this.neuralNetwork // Pass neural network reference
            );
            console.log('✓ Particle system initialized');
            
            // Setup post-processing
            this.updateLoadingMessage('Setting up visual effects...');
            try {
                this.postProcessing = new PostProcessing(
                    this.renderer,
                    this.scene,
                    this.camera,
                    this.params
                );
                console.log('✓ Post-processing initialized');
            } catch (postError) {
                console.warn('Post-processing setup failed, continuing without it:', postError);
                this.postProcessing = null;
            }
            
            // Setup GUI (only in development or if explicitly enabled)
            this.updateLoadingMessage('Finalizing...');
            await this.setupGUI();
            
            // Setup event listeners
            this.setupEventListeners();
            console.log('✓ Event listeners attached');
            
            // Mark as initialized
            this.initialized = true;
            
            // Hide loading screen
            this.hideLoadingScreen();
            console.log('✓ Loading screen hidden');
            
            // Start render loop
            this.animate();
            console.log('=== Initialization complete ===');
            
            // Send ready message if in iframe
            if (window.parent !== window) {
                window.parent.postMessage({ type: 'ready' }, '*');
            }
            
        } catch (error) {
            console.error('=== Initialization failed ===');
            console.error(error);
            this.handleError(error);
        }
    }
    
    setupRenderer() {
        try {
            this.renderer = new THREE.WebGLRenderer({
                canvas: this.canvas,
                antialias: true,
                powerPreference: 'high-performance',
                stencil: false,
                depth: true,
                alpha: false
            });
            
            this.renderer.setSize(this.sizes.width, this.sizes.height);
            this.renderer.setPixelRatio(this.sizes.pixelRatio);
            this.renderer.outputEncoding = THREE.sRGBEncoding;
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.0;
            
            // Only enable shadows if performance allows
            if (this.sizes.pixelRatio <= 1.5) {
                this.renderer.shadowMap.enabled = true;
                this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            }
            
        } catch (error) {
            console.error('WebGL not supported:', error);
            throw new Error('WebGL is required but not supported on this device');
        }
    }
    
    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        this.scene.fog = new THREE.Fog(0x000000, 10, 50);
        
        // Add subtle ambient light
        const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
        this.scene.add(ambientLight);
        
        // Add directional light for depth
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(5, 5, 5);
        this.scene.add(directionalLight);
    }
    
    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(
            45,
            this.sizes.width / this.sizes.height,
            0.1,
            100
        );
        this.camera.position.set(0, 0, 20);
        this.camera.lookAt(0, 0, 0);
    }
    
    setupControls() {
        this.controls = new OrbitControls(this.camera, this.canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxDistance = 40;
        this.controls.minDistance = 5;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = this.params.rotationSpeed;
        
        // Disable controls on touch devices for better performance
        if ('ontouchstart' in window) {
            this.controls.enablePan = false;
        }
    }
    
    async setupGUI() {
        // Skip GUI on mobile or production
        if (window.innerWidth < 768 || window.location.hostname.includes('vercel')) {
            console.log('GUI skipped (mobile or production)');
            return;
        }
        
        try {
            // Dynamic import for better code splitting
            const { Pane } = await import('tweakpane');
            
            const pane = new Pane({ 
                title: 'Neural Network Controls',
                expanded: window.innerWidth > 1024
            });
            
            const visualFolder = pane.addFolder({ title: 'Visual Settings' });
            visualFolder.addInput(this.params, 'glowIntensity', { 
                min: 0, 
                max: 3, 
                step: 0.1,
                label: 'Glow'
            });
            visualFolder.addInput(this.params, 'particleSize', { 
                min: 1, 
                max: 10, 
                step: 0.5,
                label: 'Particle Size'
            });
            visualFolder.addInput(this.params, 'networkScale', { 
                min: 0.5, 
                max: 2, 
                step: 0.1,
                label: 'Scale'
            });
            
            const animationFolder = pane.addFolder({ title: 'Animation' });
            animationFolder.addInput(this.params, 'animationSpeed', { 
                min: 0, 
                max: 3, 
                step: 0.1,
                label: 'Speed'
            });
            animationFolder.addInput(this.params, 'rotationSpeed', { 
                min: 0, 
                max: 1, 
                step: 0.05,
                label: 'Rotation'
            });
            animationFolder.addInput(this.params, 'pulseSpeed', { 
                min: 0, 
                max: 5, 
                step: 0.1,
                label: 'Pulse'
            });
            
            if (this.postProcessing) {
                const bloomFolder = pane.addFolder({ title: 'Bloom Effect' });
                bloomFolder.addInput(this.params, 'bloomStrength', { 
                    min: 0, 
                    max: 3, 
                    step: 0.1,
                    label: 'Strength'
                });
                bloomFolder.addInput(this.params, 'bloomRadius', { 
                    min: 0, 
                    max: 1, 
                    step: 0.05,
                    label: 'Radius'
                });
                bloomFolder.addInput(this.params, 'bloomThreshold', { 
                    min: 0, 
                    max: 1, 
                    step: 0.05,
                    label: 'Threshold'
                });
            }
            
            // Update values on change
            pane.on('change', (ev) => {
                this.updateParams(ev);
            });
            
            console.log('✓ GUI initialized');
            
        } catch (error) {
            console.log('GUI initialization skipped:', error.message);
        }
    }
    
    updateParams(event) {
        // Update controls
        if (this.controls) {
            this.controls.autoRotateSpeed = this.params.rotationSpeed;
        }
        
        // Update neural network
        if (this.neuralNetwork) {
            this.neuralNetwork.updateParams(this.params);
        }
        
        // Update particle system
        if (this.particleSystem) {
            this.particleSystem.updateParams(this.params);
        }
        
        // Update post-processing
        if (this.postProcessing) {
            this.postProcessing.updateParams(this.params);
        }
    }
    
    setupEventListeners() {
        // Window resize
        window.addEventListener('resize', () => this.handleResize(), { passive: true });
        
        // Mouse/touch events
        if (this.params.enableInteraction) {
            this.canvas.addEventListener('pointermove', (e) => this.handlePointerMove(e), { passive: true });
            this.canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e), { passive: true });
        }
        
        // Message API for iframe communication
        window.addEventListener('message', (e) => this.handleMessage(e), { passive: true });
        
        // Visibility change
        document.addEventListener('visibilitychange', () => this.handleVisibilityChange(), { passive: true });
    }
    
    handleResize() {
        this.sizes.width = window.innerWidth;
        this.sizes.height = window.innerHeight;
        this.sizes.pixelRatio = Math.min(window.devicePixelRatio, 2);
        
        if (this.camera) {
            this.camera.aspect = this.sizes.width / this.sizes.height;
            this.camera.updateProjectionMatrix();
        }
        
        if (this.renderer) {
            this.renderer.setSize(this.sizes.width, this.sizes.height);
            this.renderer.setPixelRatio(this.sizes.pixelRatio);
        }
        
        if (this.postProcessing) {
            this.postProcessing.setSize(this.sizes.width, this.sizes.height);
        }
    }
    
    handlePointerMove(event) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        // Update particle system with mouse position
        if (this.particleSystem) {
            this.particleSystem.updateMousePosition(this.mouse);
        }
    }
    
    handlePointerDown(event) {
        if (!this.raycaster || !this.camera || !this.neuralNetwork) return;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        const intersects = this.raycaster.intersectObjects(
            this.neuralNetwork.getInteractiveObjects()
        );
        
        if (intersects.length > 0) {
            const object = intersects[0].object;
            const point = intersects[0].point;
            
            // Trigger pulse effect
            this.neuralNetwork.triggerPulse(point);
            if (this.particleSystem) {
                this.particleSystem.triggerBurst(point);
            }
            
            // Send message to parent if in iframe
            if (window.parent !== window) {
                window.parent.postMessage({
                    type: 'nodeClicked',
                    data: {
                        nodeId: object.userData.nodeId,
                        position: point.toArray()
                    }
                }, '*');
            }
        }
    }
    
    handleMessage(event) {
        if (!event.data || !event.data.type) return;
        
        switch (event.data.type) {
            case 'updateConfig':
                if (event.data.config) {
                    Object.assign(this.params, event.data.config);
                    this.updateParams();
                }
                break;
            case 'pause':
                this.paused = true;
                break;
            case 'resume':
                this.paused = false;
                break;
        }
    }
    
    handleVisibilityChange() {
        this.paused = document.hidden;
    }
    
    updateLoadingMessage(message) {
        const loadingText = this.loadingScreen.querySelector('p');
        if (loadingText) {
            loadingText.textContent = message;
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
    
    createFallbackTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        
        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);
        
        return new THREE.CanvasTexture(canvas);
    }
    
    handleError(error) {
        console.error('Critical error:', error);
        
        // Hide loading screen
        if (this.loadingScreen) {
            this.loadingScreen.style.display = 'none';
        }
        
        // Create error message
        const errorContainer = document.createElement('div');
        errorContainer.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #ff6b6b;
            background: rgba(0, 0, 0, 0.9);
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 90%;
            z-index: 10000;
        `;
        
        errorContainer.innerHTML = `
            <h3 style="margin: 0 0 10px 0;">Initialization Error</h3>
            <p style="margin: 0 0 10px 0;">${error.message}</p>
            <p style="margin: 0; font-size: 0.9em; opacity: 0.7;">Please refresh the page or try a different browser</p>
        `;
        
        document.body.appendChild(errorContainer);
        
        // Send error message if in iframe
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
        
        // Skip frame if paused
        if (this.paused) return;
        
        // Performance monitoring
        if (this.performance) {
            this.performance.begin();
        }
        
        const deltaTime = Math.min(this.clock.getDelta(), 0.1); // Cap delta time
        const elapsedTime = this.clock.getElapsedTime();
        
        // Update controls
        if (this.controls) {
            this.controls.update();
        }
        
        // Update neural network
        if (this.neuralNetwork) {
            this.neuralNetwork.update(elapsedTime, deltaTime);
        }
        
        // Update particle system
        if (this.particleSystem) {
            this.particleSystem.update(elapsedTime, deltaTime);
        }
        
        // Render
        try {
            if (this.postProcessing && this.postProcessing.enabled) {
                this.postProcessing.render();
            } else {
                this.renderer.render(this.scene, this.camera);
            }
        } catch (renderError) {
            console.error('Render error:', renderError);
            // Disable post-processing if it's causing issues
            if (this.postProcessing) {
                this.postProcessing.enabled = false;
            }
        }
        
        // Performance monitoring
        if (this.performance) {
            this.performance.end();
        }
    }
    
    dispose() {
        // Cancel animation frame
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        // Dispose of Three.js resources
        if (this.scene) {
            this.scene.traverse((child) => {
                if (child.geometry) {
                    child.geometry.dispose();
                }
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(material => material.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }
        
        if (this.renderer) {
            this.renderer.dispose();
        }
        
        // Remove event listeners
        window.removeEventListener('resize', this.handleResize);
        window.removeEventListener('message', this.handleMessage);
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
}

// Initialize app when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.neuralNetworkApp = new NeuralNetworkApp();
    });
} else {
    // DOM already loaded
    window.neuralNetworkApp = new NeuralNetworkApp();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.neuralNetworkApp && window.neuralNetworkApp.dispose) {
        window.neuralNetworkApp.dispose();
    }
});