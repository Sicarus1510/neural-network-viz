import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

export class EnvironmentManager {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;
        
        this.init();
    }
    
    init() {
        this.setupEnvironmentMap();
        this.createBackgroundGradient();
    }
    
    setupEnvironmentMap() {
        // Create procedural environment map for reflections
        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        pmremGenerator.compileEquirectangularShader();
        
        // Create gradient environment
        const envScene = new THREE.Scene();
        const envMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTopColor: { value: new THREE.Color(0xffffff) },
                uBottomColor: { value: new THREE.Color(0xcccccc) }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 uTopColor;
                uniform vec3 uBottomColor;
                varying vec3 vWorldPosition;
                
                void main() {
                    float height = normalize(vWorldPosition).y;
                    vec3 color = mix(uBottomColor, uTopColor, height * 0.5 + 0.5);
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            side: THREE.BackSide
        });
        
        const envGeometry = new THREE.SphereGeometry(100, 32, 32);
        const envMesh = new THREE.Mesh(envGeometry, envMaterial);
        envScene.add(envMesh);
        
        // Generate environment map
        const renderTarget = new THREE.WebGLCubeRenderTarget(256);
        const cubeCamera = new THREE.CubeCamera(0.1, 100, renderTarget);
        cubeCamera.update(this.renderer, envScene);
        
        this.scene.environment = pmremGenerator.fromCubemap(renderTarget.texture).texture;
        
        pmremGenerator.dispose();
        renderTarget.dispose();
    }
    
    createBackgroundGradient() {
        // Create subtle gradient background sphere
        const bgGeometry = new THREE.SphereGeometry(50, 32, 32);
        const bgMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vPosition;
                void main() {
                    vUv = uv;
                    vPosition = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uTime;
                varying vec2 vUv;
                varying vec3 vPosition;
                
                void main() {
                    // Subtle gradient from light grey to white
                    float gradient = vUv.y;
                    vec3 color = mix(
                        vec3(0.92, 0.92, 0.92), // Light grey
                        vec3(0.98, 0.98, 0.98), // Almost white
                        gradient
                    );
                    
                    // Add very subtle variation
                    float variation = sin(vPosition.x * 0.1 + uTime * 0.1) * 
                                     sin(vPosition.z * 0.1 - uTime * 0.05) * 0.02;
                    color += variation;
                    
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            side: THREE.BackSide,
            depthWrite: false
        });
        
        this.backgroundSphere = new THREE.Mesh(bgGeometry, bgMaterial);
        this.backgroundSphere.renderOrder = -1;
        this.scene.add(this.backgroundSphere);
    }
    
    update(elapsedTime) {
        if (this.backgroundSphere) {
            this.backgroundSphere.material.uniforms.uTime.value = elapsedTime;
        }
    }
    
    dispose() {
        if (this.backgroundSphere) {
            this.backgroundSphere.geometry.dispose();
            this.backgroundSphere.material.dispose();
            this.scene.remove(this.backgroundSphere);
        }
    }
}