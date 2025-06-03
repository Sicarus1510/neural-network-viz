// src/js/core/PostProcessing.js
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

export class PostProcessing {
    constructor(renderer, scene, camera, params) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.params = params;
        this.enabled = true;
        this.disposed = false;
        
        this.init();
    }
    
    init() {
        if (this.disposed) return;
        
        try {
            const pixelRatio = this.renderer.getPixelRatio();
            const size = this.renderer.getSize(new THREE.Vector2());
            
            // Create render targets with float type for better quality
            const renderTargetParams = {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                type: THREE.HalfFloatType,
                encoding: THREE.sRGBEncoding,
                stencilBuffer: false,
                samples: pixelRatio === 1 ? 2 : 0 // Multisample only at 1x pixel ratio
            };
            
            this.renderTarget = new THREE.WebGLRenderTarget(
                size.width * pixelRatio,
                size.height * pixelRatio,
                renderTargetParams
            );
            
            // Create composer
            this.composer = new EffectComposer(this.renderer, this.renderTarget);
            this.composer.setPixelRatio(pixelRatio);
            
            // Render pass
            this.renderPass = new RenderPass(this.scene, this.camera);
            this.composer.addPass(this.renderPass);
            
            // Multi-pass bloom for better quality
            this.bloomPass1 = new UnrealBloomPass(
                new THREE.Vector2(size.width, size.height),
                this.params.bloomStrength * 0.5,
                this.params.bloomRadius * 1.2,
                this.params.bloomThreshold
            );
            this.composer.addPass(this.bloomPass1);
            
            this.bloomPass2 = new UnrealBloomPass(
                new THREE.Vector2(size.width, size.height),
                this.params.bloomStrength * 0.3,
                this.params.bloomRadius * 0.6,
                this.params.bloomThreshold * 1.2
            );
            this.composer.addPass(this.bloomPass2);
            
            // Custom glow pass
            this.glowPass = new ShaderPass({
                uniforms: {
                    tDiffuse: { value: null },
                    uIntensity: { value: 0.5 },
                    uRadius: { value: 0.4 }
                },
                vertexShader: /* glsl */`
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: /* glsl */`
                    uniform sampler2D tDiffuse;
                    uniform float uIntensity;
                    uniform float uRadius;
                    
                    varying vec2 vUv;
                    
                    vec3 gaussianBlur(sampler2D tex, vec2 uv, float radius) {
                        vec3 color = vec3(0.0);
                        float total = 0.0;
                        
                        for(float x = -4.0; x <= 4.0; x++) {
                            for(float y = -4.0; y <= 4.0; y++) {
                                vec2 offset = vec2(x, y) * radius * 0.001;
                                float weight = exp(-(x*x + y*y) * 0.1);
                                color += texture2D(tex, uv + offset).rgb * weight;
                                total += weight;
                            }
                        }
                        
                        return color / total;
                    }
                    
                    void main() {
                        vec4 original = texture2D(tDiffuse, vUv);
                        vec3 glowed = gaussianBlur(tDiffuse, vUv, uRadius);
                        
                        // Extract bright areas
                        vec3 bright = max(vec3(0.0), original.rgb - vec3(0.8));
                        
                        // Add glow to bright areas
                        vec3 final = original.rgb + glowed * bright * uIntensity;
                        
                        gl_FragColor = vec4(final, original.a);
                    }
                `
            });
            this.composer.addPass(this.glowPass);
            
            // FXAA anti-aliasing
            if (window.innerWidth > 768) {
                this.fxaaPass = new ShaderPass(FXAAShader);
                this.fxaaPass.uniforms['resolution'].value.set(
                    1 / (size.width * pixelRatio),
                    1 / (size.height * pixelRatio)
                );
                this.composer.addPass(this.fxaaPass);
            }
            
            // Advanced color grading and tone mapping
            this.colorGradingPass = new ShaderPass({
                uniforms: {
                    tDiffuse: { value: null },
                    uBrightness: { value: 1.05 },
                    uContrast: { value: 1.15 },
                    uSaturation: { value: 1.2 },
                    uVibrance: { value: 0.3 },
                    uHueShift: { value: 0.0 },
                    uVignetteAmount: { value: 0.3 },
                    uVignetteSize: { value: 1.0 }
                },
                vertexShader: /* glsl */`
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: /* glsl */`
                    uniform sampler2D tDiffuse;
                    uniform float uBrightness;
                    uniform float uContrast;
                    uniform float uSaturation;
                    uniform float uVibrance;
                    uniform float uHueShift;
                    uniform float uVignetteAmount;
                    uniform float uVignetteSize;
                    
                    varying vec2 vUv;
                    
                    vec3 rgb2hsv(vec3 c) {
                        vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
                        vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
                        vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
                        
                        float d = q.x - min(q.w, q.y);
                        float e = 1.0e-10;
                        return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
                    }
                    
                    vec3 hsv2rgb(vec3 c) {
                        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
                        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
                        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
                    }
                    
                    vec3 adjustVibrance(vec3 color, float vibrance) {
                        float luminance = dot(color, vec3(0.299, 0.587, 0.114));
                        float sat = max(color.r, max(color.g, color.b)) - min(color.r, min(color.g, color.b));
                        float boost = vibrance * (1.0 - sat);
                        return mix(vec3(luminance), color, 1.0 + boost);
                    }
                    
                    void main() {
                        vec4 color = texture2D(tDiffuse, vUv);
                        
                        // Brightness
                        color.rgb *= uBrightness;
                        
                        // Contrast
                        color.rgb = (color.rgb - 0.5) * uContrast + 0.5;
                        
                        // Vibrance
                        color.rgb = adjustVibrance(color.rgb, uVibrance);
                        
                        // Saturation and Hue
                        vec3 hsv = rgb2hsv(color.rgb);
                        hsv.x += uHueShift;
                        hsv.y *= uSaturation;
                        color.rgb = hsv2rgb(hsv);
                        
                        // Vignette
                        vec2 coord = (vUv - 0.5) * 2.0;
                        float vignette = 1.0 - dot(coord, coord) * uVignetteAmount * uVignetteSize;
                        color.rgb *= vignette;
                        
                        // Tone mapping
                        color.rgb = color.rgb / (color.rgb + vec3(1.0));
                        color.rgb = pow(color.rgb, vec3(1.0 / 2.2));
                        
                        gl_FragColor = vec4(color.rgb, color.a);
                    }
                `
            });
            this.composer.addPass(this.colorGradingPass);
            
            // Film grain for texture
            this.filmGrainPass = new ShaderPass({
                uniforms: {
                    tDiffuse: { value: null },
                    uTime: { value: 0 },
                    uIntensity: { value: 0.05 }
                },
                vertexShader: /* glsl */`
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: /* glsl */`
                    uniform sampler2D tDiffuse;
                    uniform float uTime;
                    uniform float uIntensity;
                    
                    varying vec2 vUv;
                    
                    float random(vec2 co) {
                        return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
                    }
                    
                    void main() {
                        vec4 color = texture2D(tDiffuse, vUv);
                        
                        float grain = random(vUv + fract(uTime)) * 2.0 - 1.0;
                        color.rgb += grain * uIntensity;
                        
                        gl_FragColor = color;
                    }
                `
            });
            this.composer.addPass(this.filmGrainPass);
            
        } catch (error) {
            console.error('Failed to initialize post-processing:', error);
            this.enabled = false;
        }
    }
    
    render() {
        if (this.disposed || !this.enabled) return;
        
        try {
            // Update time-based uniforms
            if (this.filmGrainPass) {
                this.filmGrainPass.uniforms.uTime.value = performance.now() * 0.001;
            }
            
            this.composer.render();
        } catch (error) {
            console.error('Post-processing render error:', error);
            this.enabled = false;
        }
    }
    
    setSize(width, height) {
        if (this.disposed) return;
        
        const pixelRatio = this.renderer.getPixelRatio();
        
        this.composer.setSize(width, height);
        this.composer.setPixelRatio(pixelRatio);
        
        this.bloomPass1.resolution.set(width, height);
        this.bloomPass2.resolution.set(width, height);
        
        if (this.fxaaPass) {
            this.fxaaPass.uniforms['resolution'].value.set(
                1 / (width * pixelRatio),
                1 / (height * pixelRatio)
            );
        }
    }
    
    updateParams(params) {
        if (this.disposed) return;
        
        this.params = params;
        
        // Update bloom passes
        this.bloomPass1.strength = params.bloomStrength * 0.5;
        this.bloomPass1.radius = params.bloomRadius * 1.2;
        this.bloomPass1.threshold = params.bloomThreshold;
        
        this.bloomPass2.strength = params.bloomStrength * 0.3;
        this.bloomPass2.radius = params.bloomRadius * 0.6;
        this.bloomPass2.threshold = params.bloomThreshold * 1.2;
        
        // Update glow pass
        if (this.glowPass) {
            this.glowPass.uniforms.uIntensity.value = params.glowIntensity * 0.3;
        }
    }
    
    dispose() {
        this.disposed = true;
        
        if (this.renderTarget) {
            this.renderTarget.dispose();
        }
        
        if (this.composer) {
            this.composer.dispose();
        }
        
        this.enabled = false;
    }
}