import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { NeuralNetwork } from './core/NeuralNetwork.js';
import { ParticleSystem } from './core/ParticleSystem.js';
import { PostProcessing } from './core/PostProcessing.js';
import { Performance } from './utils/Performance.js';
import { ResourceManager } from './utils/ResourceManager.js';
import { Pane } from 'tweakpane';

class NeuralNetworkApp {
    constructor() {
        this.canvas = document.querySelector('#webgl-canvas');
        this.loadingScreen = document.querySelector('#loading');
        
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
            glowIntensity: 1.5,
            particleSize: 3.0,
            particleCount: 5000,
            networkScale: 1.0,
            rotationSpeed: 0.1,
            pulseSpeed: 2.0,
            enableInteraction: true,
            bloomStrength: 1.5,
            bloomRadius: 0.4,
            bloomThreshold: 0.85
        };
        
        this.init();
    }
    
    async init() {
        try {
            // Initialize performance monitoring
            this.performance = new Performance();
            
            // Setup basic Three.js components
            this.setupRenderer();
            this.setupScene();
            this.setupCamera();
            this.setupControls();
            
            // Initialize resource manager
            this.resources = new ResourceManager();
            await this.resources.loadTextures({
                particle: '/textures/particle.png'
            });
            
            // Create neural network visualization
            this.neuralNetwork = new NeuralNetwork(this.scene, this.params);
            await this.neuralNetwork.init();
            
            // Create particle system
            this.particleSystem = new ParticleSystem(
                this.scene, 
                this.neuralNetwork.getNodePositions(),
                this.resources.textures.particle,
                this.params
            );
            
            // Setup post-processing
            this.postProcessing = new PostProcessing(
                this.renderer,
                this.scene,
                this.camera,
                this.params
            );
            
            // Setup GUI
            this.setupGUI();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Hide loading screen
            this.hideLoadingScreen();
            
            // Start render loop
            this.animate();
            
        } catch (error) {
            console.error('Initialization error:', error);
            this.handleError(error);
        }
    }
    
    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            powerPreference: 'high-performance',
            stencil: false,
            depth: true
        });
        
        this.renderer.setSize(this.sizes.width, this.sizes.height);
        this.renderer.setPixelRatio(this.sizes.pixelRatio);
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        
        // Enable shadows for better visual quality
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    }
    
    setupGUI() {
        if (window.innerWidth < 768) return; // Skip GUI on mobile
        
        const pane = new Pane({ title: 'Neural Network Controls' });
        
        const visualFolder = pane.addFolder({ title: 'Visual Settings' });
        visualFolder.addInput(this.params, 'glowIntensity', { min: 0, max: 3, step: 0.1 });
        visualFolder.addInput(this.params, 'particleSize', { min: 1, max: 10, step: 0.5 });
        visualFolder.addInput(this.params, 'networkScale', { min: 0.5, max: 2, step: 0.1 });
        
        const animationFolder = pane.addFolder({ title: 'Animation' });
        animationFolder.addInput(this.params, 'animationSpeed', { min: 0, max: 3, step: 0.1 });
        animationFolder.addInput(this.params, 'rotationSpeed', { min: 0, max: 1, step: 0.05 });
        animationFolder.addInput(this.params, 'pulseSpeed', { min: 0, max: 5, step: 0.1 });
        
        const bloomFolder = pane.addFolder({ title: 'Bloom Effect' });
        bloomFolder.addInput(this.params, 'bloomStrength', { min: 0, max: 3, step: 0.1 });
        bloomFolder.addInput(this.params, 'bloomRadius', { min: 0, max: 1, step: 0.05 });
        bloomFolder.addInput(this.params, 'bloomThreshold', { min: 0, max: 1, step: 0.05 });
        
        // Update values on change
        pane.on('change', (ev) => {
            this.updateParams(ev);
        });
    }
    
    updateParams(event) {
        // Update controls
        this.controls.autoRotateSpeed = this.params.rotationSpeed;
        
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
        window.addEventListener('resize', () => this.handleResize());
        
        // Mouse/touch events
        if (this.params.enableInteraction) {
            this.canvas.addEventListener('pointermove', (e) => this.handlePointerMove(e));
            this.canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
        }
        
        // Message API for iframe communication
        window.addEventListener('message', (e) => this.handleMessage(e));
    }
    
    handleResize() {
        this.sizes.width = window.innerWidth;
        this.sizes.height = window.innerHeight;
        this.sizes.pixelRatio = Math.min(window.devicePixelRatio, 2);
        
        this.camera.aspect = this.sizes.width / this.sizes.height;
        this.camera.updateProjectionMatrix();
        
        this.renderer.setSize(this.sizes.width, this.sizes.height);
        this.renderer.setPixelRatio(this.sizes.pixelRatio);
        
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
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        const intersects = this.raycaster.intersectObjects(
            this.neuralNetwork.getInteractiveObjects()
        );
        
        if (intersects.length > 0) {
            const object = intersects[0].object;
            const point = intersects[0].point;
            
            // Trigger pulse effect
            this.neuralNetwork.triggerPulse(point);
            this.particleSystem.triggerBurst(point);
            
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
        if (event.data.type === 'updateConfig') {
            Object.assign(this.params, event.data.config);
            this.updateParams();
        }
    }
    
    hideLoadingScreen() {
        this.loadingScreen.classList.add('hidden');
        setTimeout(() => {
            this.loadingScreen.style.display = 'none';
        }, 500);
    }
    
    handleError(error) {
        const errorMessage = document.createElement('div');
        errorMessage.innerHTML = `
            <div style="color: #ff6b6b; padding: 20px; text-align: center;">
                <h3>Initialization Error</h3>
                <p>${error.message}</p>
            </div>
        `;
        document.body.appendChild(errorMessage);
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Performance monitoring
        this.performance.begin();
        
        const deltaTime = this.clock.getDelta();
        const elapsedTime = this.clock.getElapsedTime();
        
        // Update controls
        this.controls.update();
        
        // Update neural network
        if (this.neuralNetwork) {
            this.neuralNetwork.update(elapsedTime, deltaTime);
        }
        
        // Update particle system
        if (this.particleSystem) {
            this.particleSystem.update(elapsedTime, deltaTime);
        }
        
        // Render
        if (this.postProcessing && this.postProcessing.enabled) {
            this.postProcessing.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
        
        // Performance monitoring
        this.performance.end();
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new NeuralNetworkApp();
});