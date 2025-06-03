// src/js/core/PostProcessing.js
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export class PostProcessing {
    constructor(renderer, scene, camera, params) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.params = params;
        this.enabled = true;
        
        this.init();
    }
    
    init() {
        const size = this.renderer.getSize(new THREE.Vector2());
        
        // Create composer with high quality render target
        const renderTargetParams = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType,
            encoding: THREE.sRGBEncoding
        };
        
        this.renderTarget = new THREE.WebGLRenderTarget(
            size.width,
            size.height,
            renderTargetParams
        );
        
        this.composer = new EffectComposer(this.renderer, this.renderTarget);
        
        // Render pass
        this.renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(this.renderPass);
        
        // Multiple bloom passes for better quality
        this.bloomPass1 = new UnrealBloomPass(
            size,
            this.params.bloomStrength,
            this.params.bloomRadius,
            this.params.bloomThreshold
        );
        this.composer.addPass(this.bloomPass1);
        
        // Custom composite pass
        this.compositePass = new ShaderPass({
            uniforms: {
                tDiffuse: { value: null },
                uTime: { value: 0 },
                uVignetteIntensity: { value: 0.4 },
                uScanlineIntensity: { value: 0.05 },
                uChromaticAberration: { value: 0.002 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform float uTime;
                uniform float uVignetteIntensity;
                uniform float uScanlineIntensity;
                uniform float uChromaticAberration;
                
                varying vec2 vUv;
                
                void main() {
                    // Chromatic aberration
                    vec2 offset = (vUv - 0.5) * uChromaticAberration;
                    vec4 color;
                    color.r = texture2D(tDiffuse, vUv - offset).r;
                    color.g = texture2D(tDiffuse, vUv).g;
                    color.b = texture2D(tDiffuse, vUv + offset).b;
                    color.a = texture2D(tDiffuse, vUv).a;
                    
                    // Vignette
                    vec2 coord = (vUv - 0.5) * 2.0;
                    float vignette = 1.0 - dot(coord, coord) * uVignetteIntensity;
                    color.rgb *= vignette;
                    
                    // Subtle scanlines
                    float scanline = sin(vUv.y * 800.0 + uTime * 2.0) * uScanlineIntensity;
                    color.rgb -= scanline;
                    
                    // Tone mapping and gamma correction
                    color.rgb = color.rgb / (color.rgb + vec3(1.0));
                    color.rgb = pow(color.rgb, vec3(1.0 / 2.2));
                    
                    gl_FragColor = color;
                }
            `
        });
        this.composer.addPass(this.compositePass);
    }
    
    render() {
        if (!this.enabled) return;
        
        // Update time uniform
        if (this.compositePass) {
            this.compositePass.uniforms.uTime.value = performance.now() * 0.001;
        }
        
        this.composer.render();
    }
    
    setSize(width, height) {
        this.composer.setSize(width, height);
        this.bloomPass1.resolution.set(width, height);
    }
    
    updateParams(params) {
        this.params = params;
        
        this.bloomPass1.strength = params.bloomStrength;
        this.bloomPass1.radius = params.bloomRadius;
        this.bloomPass1.threshold = params.bloomThreshold;
    }
    
    dispose() {
        if (this.renderTarget) this.renderTarget.dispose();
        if (this.composer) this.composer.dispose();
    }
}