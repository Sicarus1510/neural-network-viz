// src/js/core/ParticleSystem.js
import * as THREE from 'three';

export class ParticleSystem {
    constructor(scene, nodePositions, particleTexture, params, neuralNetwork) {
        this.scene = scene;
        this.nodePositions = nodePositions;
        this.particleTexture = particleTexture || this.createDefaultTexture();
        this.params = params;
        this.neuralNetwork = neuralNetwork;
        
        // Particle systems
        this.flowingParticles = null;
        this.ambientParticles = null;
        this.trailSystem = null;
        
        // Animation state
        this.time = 0;
        this.trails = [];
        
        this.init();
    }
    
    createDefaultTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        
        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
        gradient.addColorStop(0.5, 'rgba(128, 200, 255, 0.5)');
        gradient.addColorStop(1, 'rgba(0, 100, 255, 0)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);
        
        return new THREE.CanvasTexture(canvas);
    }
    
    init() {
        this.createFlowingParticles();
        this.createTrailSystem();
        this.createAmbientParticles();
    }
    
    createFlowingParticles() {
        const channels = this.neuralNetwork.getEnergyChannels();
        const particlesPerChannel = Math.floor(this.params.particleCount / channels.length / 2);
        const totalParticles = particlesPerChannel * channels.length;
        
        const geometry = new THREE.BufferGeometry();
        
        // Attributes
        const positions = new Float32Array(totalParticles * 3);
        const velocities = new Float32Array(totalParticles * 3);
        const colors = new Float32Array(totalParticles * 3);
        const sizes = new Float32Array(totalParticles);
        const opacities = new Float32Array(totalParticles);
        const channelIndices = new Float32Array(totalParticles);
        const progress = new Float32Array(totalParticles);
        const speeds = new Float32Array(totalParticles);
        
        let particleIndex = 0;
        
        channels.forEach((channel, channelIndex) => {
            for (let i = 0; i < particlesPerChannel; i++) {
                const i3 = particleIndex * 3;
                
                // Initialize along the channel curve
                const t = Math.random();
                const point = channel.curve.getPoint(t);
                const tangent = channel.curve.getTangent(t);
                
                positions[i3] = point.x;
                positions[i3 + 1] = point.y;
                positions[i3 + 2] = point.z;
                
                velocities[i3] = tangent.x;
                velocities[i3 + 1] = tangent.y;
                velocities[i3 + 2] = tangent.z;
                
                // Color variation (cyan to blue)
                const hue = 0.5 + Math.random() * 0.08;
                const color = new THREE.Color().setHSL(hue, 0.9, 0.6);
                colors[i3] = color.r;
                colors[i3 + 1] = color.g;
                colors[i3 + 2] = color.b;
                
                sizes[particleIndex] = 20 + Math.random() * 30;
                opacities[particleIndex] = 0.3 + Math.random() * 0.7;
                channelIndices[particleIndex] = channelIndex;
                progress[particleIndex] = t;
                speeds[particleIndex] = 0.3 + Math.random() * 0.4;
                
                particleIndex++;
            }
        });
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('opacity', new THREE.BufferAttribute(opacities, 1));
        geometry.setAttribute('channelIndex', new THREE.BufferAttribute(channelIndices, 1));
        geometry.setAttribute('progress', new THREE.BufferAttribute(progress, 1));
        geometry.setAttribute('speed', new THREE.BufferAttribute(speeds, 1));
        
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uTexture: { value: this.particleTexture },
                uCameraPosition: { value: new THREE.Vector3() }
            },
            vertexShader: `
                attribute float size;
                attribute float opacity;
                attribute vec3 velocity;
                
                varying vec3 vColor;
                varying float vOpacity;
                
                uniform float uTime;
                uniform vec3 uCameraPosition;
                
                void main() {
                    vColor = color;
                    vOpacity = opacity;
                    
                    vec3 pos = position;
                    
                    // Add some turbulence
                    float turbulence = sin(uTime * 2.0 + position.x * 5.0) * 0.02;
                    pos.y += turbulence;
                    
                    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    
                    // Size attenuation
                    float sizeAttenuation = 300.0 / -mvPosition.z;
                    gl_PointSize = size * sizeAttenuation;
                    gl_PointSize = clamp(gl_PointSize, 2.0, 100.0);
                    
                    // Fade based on camera distance
                    float cameraDistance = length(uCameraPosition - pos);
                    vOpacity *= smoothstep(20.0, 5.0, cameraDistance);
                }
            `,
            fragmentShader: `
                uniform sampler2D uTexture;
                uniform float uTime;
                
                varying vec3 vColor;
                varying float vOpacity;
                
                void main() {
                    vec2 uv = gl_PointCoord;
                    vec4 texColor = texture2D(uTexture, uv);
                    
                    // Create glow
                    float dist = length(uv - vec2(0.5));
                    float glow = 1.0 - smoothstep(0.0, 0.5, dist);
                    glow = pow(glow, 2.0);
                    
                    vec3 finalColor = vColor * (1.0 + glow);
                    float finalAlpha = texColor.a * vOpacity * glow;
                    
                    gl_FragColor = vec4(finalColor, finalAlpha);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            vertexColors: true
        });
        
        this.flowingParticles = new THREE.Points(geometry, material);
        this.scene.add(this.flowingParticles);
    }
    
    createTrailSystem() {
        // Create persistent trail system
        const maxTrails = 100;
        const trailLength = 30;
        const totalPoints = maxTrails * trailLength;
        
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(totalPoints * 3);
        const colors = new Float32Array(totalPoints * 3);
        const alphas = new Float32Array(totalPoints);
        
        // Initialize all positions to origin
        for (let i = 0; i < totalPoints * 3; i++) {
            positions[i] = 0;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
        
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 }
            },
            vertexShader: `
                attribute float alpha;
                varying vec3 vColor;
                varying float vAlpha;
                
                void main() {
                    vColor = color;
                    vAlpha = alpha;
                    
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    gl_PointSize = mix(1.0, 8.0, vAlpha) * (200.0 / -mvPosition.z);
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                varying float vAlpha;
                
                void main() {
                    float dist = length(gl_PointCoord - vec2(0.5));
                    if (dist > 0.5) discard;
                    
                    float alpha = (1.0 - dist * 2.0) * vAlpha;
                    gl_FragColor = vec4(vColor * 2.0, alpha);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            vertexColors: true
        });
        
        this.trailSystem = new THREE.Points(geometry, material);
        this.scene.add(this.trailSystem);
        
        // Initialize trail data
        for (let i = 0; i < maxTrails; i++) {
            this.trails.push({
                positions: new Array(trailLength).fill(null).map(() => new THREE.Vector3()),
                colors: new Array(trailLength).fill(null).map(() => new THREE.Color()),
                active: false,
                currentIndex: 0,
                channelIndex: 0,
                progress: 0,
                speed: 0.5 + Math.random() * 0.5,
                lifetime: 0
            });
        }
    }
    
    createAmbientParticles() {
        // Create ambient floating particles
        const count = Math.floor(this.params.particleCount * 0.3);
        const geometry = new THREE.BufferGeometry();
        
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        
        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            
            // Distribute around the octagon
            const angle = Math.random() * Math.PI * 2;
            const radius = 5 + Math.random() * 10;
            const height = (Math.random() - 0.5) * 2;
            
            positions[i3] = Math.cos(angle) * radius;
            positions[i3 + 1] = height;
            positions[i3 + 2] = Math.sin(angle) * radius;
            
            const color = new THREE.Color().setHSL(0.5 + Math.random() * 0.1, 0.5, 0.5);
            colors[i3] = color.r;
            colors[i3 + 1] = color.g;
            colors[i3 + 2] = color.b;
            
            sizes[i] = 5 + Math.random() * 15;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uTexture: { value: this.particleTexture }
            },
            vertexShader: `
                attribute float size;
                varying vec3 vColor;
                varying float vSize;
                
                uniform float uTime;
                
                void main() {
                    vColor = color;
                    vSize = size;
                    
                    vec3 pos = position;
                    float phase = position.x + position.z;
                    pos.y += sin(uTime * 0.5 + phase) * 0.2;
                    pos.x += cos(uTime * 0.3 + phase) * 0.1;
                    
                    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    gl_PointSize = size * (200.0 / -mvPosition.z);
                }
            `,
            fragmentShader: `
                uniform sampler2D uTexture;
                uniform float uTime;
                
                varying vec3 vColor;
                
                void main() {
                    vec4 texColor = texture2D(uTexture, gl_PointCoord);
                    float alpha = texColor.a * 0.3 * (0.5 + 0.5 * sin(uTime));
                    gl_FragColor = vec4(vColor, alpha);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            vertexColors: true
        });
        
        this.ambientParticles = new THREE.Points(geometry, material);
        this.scene.add(this.ambientParticles);
    }
    
    update(elapsedTime, deltaTime) {
        this.time = elapsedTime;
        
        // Update camera position in shaders
        const camera = this.scene.getObjectByProperty('type', 'PerspectiveCamera');
        if (camera) {
            if (this.flowingParticles) {
                this.flowingParticles.material.uniforms.uCameraPosition.value.copy(camera.position);
            }
        }
        
        // Update all material uniforms
        [this.flowingParticles, this.trailSystem, this.ambientParticles].forEach(system => {
            if (system && system.material.uniforms.uTime) {
                system.material.uniforms.uTime.value = elapsedTime;
            }
        });
        
        // Update flowing particles along channels
        if (this.flowingParticles) {
            const positions = this.flowingParticles.geometry.attributes.position;
            const velocities = this.flowingParticles.geometry.attributes.velocity;
            const progress = this.flowingParticles.geometry.attributes.progress;
            const speeds = this.flowingParticles.geometry.attributes.speed;
            const channelIndices = this.flowingParticles.geometry.attributes.channelIndex;
            const opacities = this.flowingParticles.geometry.attributes.opacity;
            
            const channels = this.neuralNetwork.getEnergyChannels();
            
            for (let i = 0; i < positions.count; i++) {
                const i3 = i * 3;
                
                // Update progress
                progress.array[i] += speeds.array[i] * deltaTime * this.params.animationSpeed;
                
                if (progress.array[i] > 1) {
                    progress.array[i] = 0;
                    // Reset opacity
                    opacities.array[i] = 0.3 + Math.random() * 0.7;
                }
                
                // Get position on curve
                const channelIndex = Math.floor(channelIndices.array[i]);
                const channel = channels[channelIndex];
                
                if (channel) {
                    const t = progress.array[i];
                    const point = channel.curve.getPoint(t);
                    const tangent = channel.curve.getTangent(t);
                    
                    // Add some offset for variation
                    const offset = Math.sin(elapsedTime * 2 + i) * 0.1;
                    
                    positions.array[i3] = point.x + tangent.y * offset;
                    positions.array[i3 + 1] = point.y;
                    positions.array[i3 + 2] = point.z - tangent.x * offset;
                    
                    velocities.array[i3] = tangent.x;
                    velocities.array[i3 + 1] = tangent.y;
                    velocities.array[i3 + 2] = tangent.z;
                }
                
                // Fade in/out at ends
                const fadeIn = smoothstep(0, 0.1, progress.array[i]);
                const fadeOut = smoothstep(1, 0.9, progress.array[i]);
                opacities.array[i] *= fadeIn * fadeOut;
            }
            
            positions.needsUpdate = true;
            velocities.needsUpdate = true;
            progress.needsUpdate = true;
            opacities.needsUpdate = true;
        }
        
        // Update trails
        this.updateTrails(deltaTime);
    }
    
    updateTrails(deltaTime) {
        const positions = this.trailSystem.geometry.attributes.position;
        const colors = this.trailSystem.geometry.attributes.color;
        const alphas = this.trailSystem.geometry.attributes.alpha;
        
        const channels = this.neuralNetwork.getEnergyChannels();
        
        this.trails.forEach((trail, trailIndex) => {
            // Randomly activate trails
            if (!trail.active && Math.random() < 0.02) {
                trail.active = true;
                trail.channelIndex = Math.floor(Math.random() * channels.length);
                trail.progress = 0;
                trail.lifetime = 2.0;
                trail.currentIndex = 0;
                
                // Set trail color
                const hue = 0.5 + Math.random() * 0.1;
                const color = new THREE.Color().setHSL(hue, 1.0, 0.7);
                trail.colors.forEach(c => c.copy(color));
            }
            
            if (trail.active) {
                trail.progress += trail.speed * deltaTime;
                trail.lifetime -= deltaTime;
                
                if (trail.progress > 1 || trail.lifetime <= 0) {
                    trail.active = false;
                    
                    // Clear trail
                    for (let i = 0; i < trail.positions.length; i++) {
                        const idx = trailIndex * trail.positions.length + i;
                        alphas.array[idx] = 0;
                    }
                } else {
                    // Update trail
                    const channel = channels[trail.channelIndex];
                    if (channel) {
                        const point = channel.curve.getPoint(trail.progress);
                        
                        // Add new position
                        trail.currentIndex = (trail.currentIndex + 1) % trail.positions.length;
                        trail.positions[trail.currentIndex].copy(point);
                        
                        // Update buffer
                        for (let i = 0; i < trail.positions.length; i++) {
                            const idx = trailIndex * trail.positions.length + i;
                            const pos = trail.positions[(trail.currentIndex - i + trail.positions.length) % trail.positions.length];
                            
                            positions.array[idx * 3] = pos.x;
                            positions.array[idx * 3 + 1] = pos.y;
                            positions.array[idx * 3 + 2] = pos.z;
                            
                            const color = trail.colors[i];
                            colors.array[idx * 3] = color.r;
                            colors.array[idx * 3 + 1] = color.g;
                            colors.array[idx * 3 + 2] = color.b;
                            
                            // Fade trail
                            alphas.array[idx] = (1 - i / trail.positions.length) * trail.lifetime / 2.0;
                        }
                    }
                }
            }
        });
        
        positions.needsUpdate = true;
        colors.needsUpdate = true;
        alphas.needsUpdate = true;
    }
    
    updateMousePosition(mousePosition) {
        // Handle mouse interaction if needed
    }
    
    triggerBurst(position) {
        // Trigger particle burst at position
        // Could activate multiple trails from this position
        const nearestTrails = this.trails.filter(t => !t.active).slice(0, 5);
        nearestTrails.forEach(trail => {
            trail.active = true;
            trail.progress = 0;
            trail.lifetime = 3.0;
            // Set to burst from interaction point
        });
    }
    
    updateParams(params) {
        this.params = params;
    }
    
    dispose() {
        [this.flowingParticles, this.trailSystem, this.ambientParticles].forEach(system => {
            if (system) {
                if (system.geometry) system.geometry.dispose();
                if (system.material) system.material.dispose();
                this.scene.remove(system);
            }
        });
    }
}

// Utility function
function smoothstep(min, max, value) {
    const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return x * x * (3 - 2 * x);
}