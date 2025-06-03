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
        
        this.init();
    }
    
    init() {
        // Create render target with optimized settings
        const renderTargetParams = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            encoding: THREE.sRGBEncoding,
            stencilBuffer: false
        };
        
        this.renderTarget = new THREE.WebGLRenderTarget(
            window.innerWidth * window.devicePixelRatio,
            window.innerHeight * window.devicePixelRatio,
            renderTargetParams
        );
        
        // Create composer
        this.composer = new EffectComposer(this.renderer, this.renderTarget);
        this.composer.setPixelRatio(window.devicePixelRatio);
        
        // Add render pass
        this.renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(this.renderPass);
        
        // Add bloom pass
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            this.params.bloomStrength,
            this.params.bloomRadius,
            this.params.bloomThreshold
        );
        this.composer.addPass(this.bloomPass);
        
        // Add FXAA anti-aliasing pass
        this.fxaaPass = new ShaderPass(FXAAShader);
        this.fxaaPass.uniforms['resolution'].value.set(
            1 / (window.innerWidth * window.devicePixelRatio),
            1 / (window.innerHeight * window.devicePixelRatio)
        );
        this.composer.addPass(this.fxaaPass);
        
        // Custom color correction pass
        this.colorCorrectionPass = new ShaderPass({
            uniforms: {
                tDiffuse: { value: null },
                brightness: { value: 1.1 },
                contrast: { value: 1.2 },
                saturation: { value: 1.3 }
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
                uniform float brightness;
                uniform float contrast;
                uniform float saturation;
                
                varying vec2 vUv;
                
                vec3 adjustSaturation(vec3 color, float adjustment) {
                    const vec3 luminosityFactor = vec3(0.2126, 0.7152, 0.0722);
                    vec3 grayscale = vec3(dot(color, luminosityFactor));
                    return mix(grayscale, color, adjustment);
                }
                
                void main() {
                    vec4 color = texture2D(tDiffuse, vUv);
                    
                    // Brightness
                    color.rgb *= brightness;
                    
                    // Contrast
                    color.rgb = (color.rgb - 0.5) * contrast + 0.5;
                    
                    // Saturation
                    color.rgb = adjustSaturation(color.rgb, saturation);
                    
                    gl_FragColor = color;
                }
            `
        });
        this.composer.addPass(this.colorCorrectionPass);
    }
    
    render() {
        this.composer.render();
    }
    
    setSize(width, height) {
        const pixelRatio = window.devicePixelRatio;
        
        this.composer.setSize(width, height);
        this.composer.setPixelRatio(pixelRatio);
        
        this.bloomPass.resolution.set(width, height);
        
        this.fxaaPass.uniforms['resolution'].value.set(
            1 / (width * pixelRatio),
            1 / (height * pixelRatio)
        );
    }
    
    updateParams(params) {
        this.params = params;
        
        this.bloomPass.strength = params.bloomStrength;
        this.bloomPass.radius = params.bloomRadius;
        this.bloomPass.threshold = params.bloomThreshold;
    }
}