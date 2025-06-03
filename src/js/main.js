import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';

import { NeuralNetworkMesh } from './components/NeuralNetworkMesh.js';
import { VolumetricClouds } from './components/VolumetricClouds.js';
import { ParticleFlow } from './components/ParticleFlow.js';
import { EnvironmentManager } from './components/EnvironmentManager.js';

class NeuralNetworkVisualization {
    constructor() {
        this.container = document.getElementById('webgl-canvas');
        this.clock = new THREE.Clock();
        this.mouse = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();
        
        this.params = {
            exposure: 1.2,
            bloomStrength: 1.5,
            bloomThreshold: 0.4,
            bloomRadius: 0.8,
            particleCount: 5000,
            particleSpeed: 0.5,
            cloudDensity: 0.8,
            cloudOpacity: 0.6,
            rotationSpeed: 0.1,
            glassRoughness: 0.1,
            glassTransmission: 0.95,
            glassThickness: 0.5,
            glassIOR: 1.5
        };
        
        this.init();
    }
    
    init() {
        this.setupRenderer();
        this.setupScene();
        this.setupCamera();
        this.setupLights();
        this.setupControls();
        this.setupPostProcessing();
        
        // Core components
        this.environmentManager = new EnvironmentManager(this.scene, this.renderer);
        this.neuralNetwork = new NeuralNetworkMesh(this.scene, this.params);
        this.volumetricClouds = new VolumetricClouds(this.scene, this.params);
        this.particleFlow = new ParticleFlow(this.scene, this.neuralNetwork, this.params);
        
        this.setupEventListeners();
        this.setupStats();
        
        // Start animation
        this.animate();
    }
    
    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.container,
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance'
        });
        
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = this.params.exposure;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // Enable logarithmic depth buffer for better depth precision
        this.renderer.logarithmicDepthBuffer = true;
    }
    
    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf0f0f0); // Light grey like reference
        this.scene.fog = new THREE.FogExp2(0xf0f0f0, 0.002);
    }
    
    setupCamera() {
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
        this.camera.position.set(0, 0, 30);
        this.camera.lookAt(0, 0, 0);
    }
    
    setupLights() {
        // Ambient light for overall illumination
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);
        
        // Key light - warm golden
        const keyLight = new THREE.DirectionalLight(0xffaa44, 1.5);
        keyLight.position.set(10, 10, 10);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 2048;
        keyLight.shadow.mapSize.height = 2048;
        keyLight.shadow.camera.near = 0.5;
        keyLight.shadow.camera.far = 50;
        keyLight.shadow.camera.left = -20;
        keyLight.shadow.camera.right = 20;
        keyLight.shadow.camera.top = 20;
        keyLight.shadow.camera.bottom = -20;
        this.scene.add(keyLight);
        
        // Fill light - cool blue
        const fillLight = new THREE.DirectionalLight(0x4488ff, 0.5);
        fillLight.position.set(-10, 5, -10);
        this.scene.add(fillLight);
        
        // Rim light for edge highlights
        const rimLight = new THREE.DirectionalLight(0xffffff, 0.8);
        rimLight.position.set(0, -10, -10);
        this.scene.add(rimLight);
        
        // Point lights for glowing nodes
        this.nodeLights = [];
    }
    
    setupControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 15;
        this.controls.maxDistance = 50;
        this.controls.maxPolarAngle = Math.PI * 0.9;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = this.params.rotationSpeed;
    }
    
    setupPostProcessing() {
        const renderScene = new RenderPass(this.scene, this.camera);
        
        // Bloom pass for glow effects
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            this.params.bloomStrength,
            this.params.bloomRadius,
            this.params.bloomThreshold
        );
        
        // SMAA for antialiasing
        const smaaPass = new SMAAPass(
            window.innerWidth * this.renderer.getPixelRatio(),
            window.innerHeight * this.renderer.getPixelRatio()
        );
        
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(renderScene);
        this.composer.addPass(this.bloomPass);
        this.composer.addPass(smaaPass);
    }
    
    setupEventListeners() {
        window.addEventListener('resize', () => this.onWindowResize(), false);
        window.addEventListener('mousemove', (e) => this.onMouseMove(e), false);
        window.addEventListener('click', (e) => this.onMouseClick(e), false);
    }
    
    setupStats() {
        if (import.meta.env.DEV) {
            this.stats = Stats();
            document.body.appendChild(this.stats.dom);
        }
    }
    
    onWindowResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        this.renderer.setSize(width, height);
        this.composer.setSize(width, height);
        
        this.bloomPass.resolution.set(width, height);
    }
    
    onMouseMove(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        // Update particle flow with mouse position
        if (this.particleFlow) {
            this.particleFlow.updateMousePosition(this.mouse);
        }
    }
    
    onMouseClick(event) {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        const intersects = this.raycaster.intersectObjects(
            this.neuralNetwork.getInteractableObjects()
        );
        
        if (intersects.length > 0) {
            const point = intersects[0].point;
            this.particleFlow.triggerBurst(point);
            this.neuralNetwork.pulseNode(intersects[0].object);
        }
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        if (this.stats) this.stats.begin();
        
        const deltaTime = this.clock.getDelta();
        const elapsedTime = this.clock.getElapsedTime();
        
        // Update controls
        this.controls.update();
        
        // Update components
        this.neuralNetwork.update(elapsedTime, deltaTime);
        this.volumetricClouds.update(elapsedTime, deltaTime);
        this.particleFlow.update(elapsedTime, deltaTime);
        this.environmentManager.update(elapsedTime);
        
        // Update renderer tone mapping
        this.renderer.toneMappingExposure = this.params.exposure;
        
        // Render
        this.composer.render();
        
        if (this.stats) this.stats.end();
    }
    
    dispose() {
        this.neuralNetwork.dispose();
        this.volumetricClouds.dispose();
        this.particleFlow.dispose();
        this.environmentManager.dispose();
        
        this.controls.dispose();
        this.renderer.dispose();
    }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.app = new NeuralNetworkVisualization();
    });
} else {
    window.app = new NeuralNetworkVisualization();
}