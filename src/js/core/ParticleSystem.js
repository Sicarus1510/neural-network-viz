// src/js/core/ParticleSystem.js
import * as THREE from 'three';

export class ParticleSystem {
    constructor(scene, nodePositions, particleTexture, params, neuralNetwork) {
        this.scene = scene;
        this.nodePositions = nodePositions;
        this.particleTexture = particleTexture;
        this.params = params;
        this.neuralNetwork = neuralNetwork;
        
        // Particle system components
        this.particleGroups = [];
        this.flowParticles = null;
        this.trailParticles = null;
        this.burstParticles = null;
        
        // Flow field data
        this.flowField = neuralNetwork.getFlowField();
        this.flowPaths = neuralNetwork.getFlowPaths();
        
        // Animation state
        this.time = 0;
        this.mousePosition = new THREE.Vector2();
        this.mouseWorldPosition = new THREE.Vector3();
        
        // Performance
        this.maxParticles = params.particleCount;
        this.trailLength = 20;
        
        this.init();
    }
    
    init() {
        this.createFlowParticles();
        this.createTrailSystem();
        this.createBurstSystem();
        this.createAmbientParticles();
    }
    
    createFlowParticles() {
        // Particles that flow along network paths
        const particleCount = Math.floor(this.maxParticles * 0.3);
        const geometry = new THREE.BufferGeometry();
        
        // Attributes
        const positions = new Float32Array(particleCount * 3);
        const velocities = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);
        const lifetimes = new Float32Array(particleCount);
        const pathIndices = new Float32Array(particleCount);
        const pathProgress = new Float32Array(particleCount);
        const speeds = new Float32Array(particleCount);
        
        // Initialize flow particles
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            
            // Assign to random flow path
            const pathIndex = Math.floor(Math.random() * this.flowPaths.length);
            const path = this.flowPaths[pathIndex];
            const progress = Math.random();
            const point = path.curve.getPoint(progress);
            
            positions[i3] = point.x;
            positions[i3 + 1] = point.y;
            positions[i3 + 2] = point.z;
            
            // Set velocities based on path tangent
            const tangent = path.curve.getTangent(progress);
            velocities[i3] = tangent.x;
            velocities[i3 + 1] = tangent.y;
            velocities[i3 + 2] = tangent.z;
            
            // Color gradient (cyan to blue to purple)
            const hue = 0.5 + Math.random() * 0.2;
            const color = new THREE.Color().setHSL(hue, 0.8, 0.6);
            colors[i3] = color.r;
            colors[i3 + 1] = color.g;
            colors[i3 + 2] = color.b;
            
            sizes[i] = Math.random() * 4 + 2;
            lifetimes[i] = Math.random() * 10 + 5;
            pathIndices[i] = pathIndex;
            pathProgress[i] = progress;
            speeds[i] = 0.1 + Math.random() * 0.2;
        }
        
        // Set attributes
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1));
        geometry.setAttribute('pathIndex', new THREE.BufferAttribute(pathIndices, 1));
        geometry.setAttribute('pathProgress', new THREE.BufferAttribute(pathProgress, 1));
        geometry.setAttribute('speed', new THREE.BufferAttribute(speeds, 1));
        
        // Advanced shader material
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uTexture: { value: this.particleTexture },
                uFlowField: { value: this.flowField },
                uMousePosition: { value: new THREE.Vector3() },
                uGlowIntensity: { value: this.params.glowIntensity },
                uParticleSize: { value: this.params.particleSize },
                uCameraPosition: { value: new THREE.Vector3() }
            },
            vertexShader: this.getFlowVertexShader(),
            fragmentShader: this.getFlowFragmentShader(),
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            vertexColors: true
        });
        
        this.flowParticles = new THREE.Points(geometry, material);
        this.flowParticles.frustumCulled = false;
        this.scene.add(this.flowParticles);
        this.particleGroups.push(this.flowParticles);
    }
    
    createTrailSystem() {
        // Create particle trails for flowing effects
        const trailCount = 50;
        const geometry = new THREE.BufferGeometry();
        const totalVertices = trailCount * this.trailLength;
        
        const positions = new Float32Array(totalVertices * 3);
        const colors = new Float32Array(totalVertices * 3);
        const alphas = new Float32Array(totalVertices);
        
        // Initialize trail positions
        for (let i = 0; i < totalVertices; i++) {
            positions[i * 3] = 0;
            positions[i * 3 + 1] = 0;
            positions[i * 3 + 2] = 0;
            
            colors[i * 3] = 0;
            colors[i * 3 + 1] = 0.8;
            colors[i * 3 + 2] = 1;
            
            alphas[i] = 0;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
        
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 }
            },
            vertexShader: /* glsl */`
                attribute float alpha;
                varying vec3 vColor;
                varying float vAlpha;
                
                void main() {
                    vColor = color;
                    vAlpha = alpha;
                    
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    gl_PointSize = 4.0 * (1.0 / -mvPosition.z);
                }
            `,
            fragmentShader: /* glsl */`
                varying vec3 vColor;
                varying float vAlpha;
                
                void main() {
                    float d = length(gl_PointCoord - vec2(0.5));
                    if (d > 0.5) discard;
                    
                    float alpha = (1.0 - d * 2.0) * vAlpha;
                    gl_FragColor = vec4(vColor, alpha);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            vertexColors: true
        });
        
        this.trailParticles = new THREE.Points(geometry, material);
        this.scene.add(this.trailParticles);
        
        // Store trail data
        this.trails = [];
        for (let i = 0; i < trailCount; i++) {
            this.trails.push({
                positions: new Array(this.trailLength).fill(null).map(() => new THREE.Vector3()),
                currentIndex: 0,
                active: false,
                pathIndex: 0,
                progress: 0,
                speed: 0.1 + Math.random() * 0.1
            });
        }
    }
    
    createBurstSystem() {
        // Enhanced burst particle system
        const burstCount = 500;
        const geometry = new THREE.BufferGeometry();
        
        const positions = new Float32Array(burstCount * 3);
        const velocities = new Float32Array(burstCount * 3);
        const colors = new Float32Array(burstCount * 3);
        const sizes = new Float32Array(burstCount);
        const lifetimes = new Float32Array(burstCount);
        const types = new Float32Array(burstCount); // 0: spark, 1: glow, 2: trail
        
        for (let i = 0; i < burstCount; i++) {
            const i3 = i * 3;
            positions[i3] = 0;
            positions[i3 + 1] = 0;
            positions[i3 + 2] = 0;
            
            velocities[i3] = 0;
            velocities[i3 + 1] = 0;
            velocities[i3 + 2] = 0;
            
            colors[i3] = 1;
            colors[i3 + 1] = 1;
            colors[i3 + 2] = 1;
            
            sizes[i] = 0;
            lifetimes[i] = 0;
            types[i] = Math.floor(Math.random() * 3);
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1));
        geometry.setAttribute('particleType', new THREE.BufferAttribute(types, 1));
        
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uTexture: { value: this.particleTexture }
            },
            vertexShader: this.getBurstVertexShader(),
            fragmentShader: this.getBurstFragmentShader(),
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            vertexColors: true
        });
        
        this.burstParticles = new THREE.Points(geometry, material);
        this.scene.add(this.burstParticles);
    }
    
    createAmbientParticles() {
        // Ambient floating particles for atmosphere
        const ambientCount = Math.floor(this.maxParticles * 0.2);
        const geometry = new THREE.BufferGeometry();
        
        const positions = new Float32Array(ambientCount * 3);
        const colors = new Float32Array(ambientCount * 3);
        const sizes = new Float32Array(ambientCount);
        const phases = new Float32Array(ambientCount);
        
        for (let i = 0; i < ambientCount; i++) {
            const i3 = i * 3;
            
            // Distribute in sphere around octagon
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(Math.random() * 2 - 1);
            const radius = 10 + Math.random() * 5;
            
            positions[i3] = Math.sin(phi) * Math.cos(theta) * radius;
            positions[i3 + 1] = Math.sin(phi) * Math.sin(theta) * radius;
            positions[i3 + 2] = Math.cos(phi) * radius * 0.5;
            
            // Soft colors
            const hue = 0.5 + Math.random() * 0.1;
            const color = new THREE.Color().setHSL(hue, 0.3, 0.6);
            colors[i3] = color.r;
            colors[i3 + 1] = color.g;
            colors[i3 + 2] = color.b;
            
            sizes[i] = Math.random() * 2 + 1;
            phases[i] = Math.random() * Math.PI * 2;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
        
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uTexture: { value: this.particleTexture }
            },
            vertexShader: /* glsl */`
                attribute float size;
                attribute float phase;
                
                varying vec3 vColor;
                varying float vPhase;
                
                uniform float uTime;
                
                void main() {
                    vColor = color;
                    vPhase = phase;
                    
                    vec3 pos = position;
                    
                    // Gentle floating motion
                    pos.y += sin(uTime * 0.5 + phase) * 0.5;
                    pos.x += cos(uTime * 0.3 + phase * 2.0) * 0.3;
                    
                    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    
                    gl_PointSize = size * (300.0 / -mvPosition.z);
                }
            `,
            fragmentShader: /* glsl */`
                uniform sampler2D uTexture;
                uniform float uTime;
                
                varying vec3 vColor;
                varying float vPhase;
                
                void main() {
                    vec2 uv = gl_PointCoord;
                    vec4 tex = texture2D(uTexture, uv);
                    
                    float alpha = tex.a * (0.5 + 0.5 * sin(uTime + vPhase));
                    
                    gl_FragColor = vec4(vColor, alpha * 0.3);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            vertexColors: true
        });
        
        const ambientParticles = new THREE.Points(geometry, material);
        this.scene.add(ambientParticles);
        this.particleGroups.push(ambientParticles);
    }
    
    // Shader functions
    getFlowVertexShader() {
        return /* glsl */`
            attribute vec3 velocity;
            attribute float size;
            attribute float lifetime;
            attribute float pathProgress;
            attribute float speed;
            
            uniform float uTime;
            uniform float uParticleSize;
            uniform vec3 uCameraPosition;
            uniform vec3 uMousePosition;
            
            varying vec3 vColor;
            varying float vOpacity;
            varying float vGlow;
            
            void main() {
                vColor = color;
                
                // Calculate opacity based on lifetime
                vOpacity = smoothstep(0.0, 2.0, lifetime) * smoothstep(10.0, 8.0, lifetime);
                
                // Apply velocity motion
                vec3 pos = position + velocity * uTime * 0.1;
                
                // Mouse interaction
                vec3 toMouse = pos - uMousePosition;
                float mouseDistance = length(toMouse);
                if (mouseDistance < 3.0) {
                    pos += normalize(toMouse) * (3.0 - mouseDistance) * 0.5;
                    vGlow = 1.0 - mouseDistance / 3.0;
                } else {
                    vGlow = 0.0;
                }
                
                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                
                // Size with distance attenuation
                float sizeAttenuation = 300.0 / -mvPosition.z;
                gl_PointSize = size * uParticleSize * sizeAttenuation;
                
                // Add pulsing based on speed
                gl_PointSize *= (1.0 + 0.3 * sin(uTime * speed * 10.0));
                gl_PointSize = clamp(gl_PointSize, 1.0, 30.0);
            }
        `;
    }
    
    getFlowFragmentShader() {
        return /* glsl */`
            uniform sampler2D uTexture;
            uniform float uGlowIntensity;
            uniform float uTime;
            
            varying vec3 vColor;
            varying float vOpacity;
            varying float vGlow;
            
            void main() {
                vec2 uv = gl_PointCoord;
                vec4 texColor = texture2D(uTexture, uv);
                
                // Create sharp center with soft edges
                float dist = length(uv - vec2(0.5));
                float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
                
                // Enhanced glow effect
                float glow = exp(-dist * 4.0) * uGlowIntensity;
                glow += exp(-dist * 8.0) * uGlowIntensity * 0.5; // Double glow layer
                
                // Color with enhanced brightness
                vec3 finalColor = vColor;
                finalColor += vec3(1.0) * glow * 0.5;
                finalColor *= (1.0 + vGlow * 2.0); // Mouse glow
                
                // Brightness variation
                float brightness = 1.0 + 0.3 * sin(uTime * 3.0 + gl_FragCoord.x * 0.01);
                finalColor *= brightness;
                
                // Final alpha with texture
                float finalAlpha = alpha * vOpacity * texColor.a;
                finalAlpha = max(finalAlpha, glow * 0.3); // Ensure glow is visible
                
                gl_FragColor = vec4(finalColor, finalAlpha);
            }
        `;
    }
    
    getBurstVertexShader() {
        return /* glsl */`
            attribute vec3 velocity;
            attribute float size;
            attribute float lifetime;
            attribute float particleType;
            
            uniform float uTime;
            
            varying vec3 vColor;
            varying float vOpacity;
            varying float vType;
            
            void main() {
                vColor = color;
                vType = particleType;
                vOpacity = lifetime;
                
                vec3 pos = position;
                
                // Different motion for different particle types
                if (particleType < 0.5) {
                    // Sparks - fast and straight
                    pos += velocity * uTime * 2.0;
                } else if (particleType < 1.5) {
                    // Glow - slower with curve
                    pos += velocity * uTime;
                    pos.y += sin(uTime * 3.0) * 0.1;
                } else {
                    // Trail - follows path with gravity
                    pos += velocity * uTime;
                    pos.y -= uTime * uTime * 0.5; // Gravity
                }
                
                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                
                // Size based on type and lifetime
                float baseSize = particleType < 0.5 ? size * 0.5 : size;
                gl_PointSize = baseSize * (300.0 / -mvPosition.z) * lifetime;
            }
        `;
    }
    
    getBurstFragmentShader() {
        return /* glsl */`
            uniform sampler2D uTexture;
            
            varying vec3 vColor;
            varying float vOpacity;
            varying float vType;
            
            void main() {
                vec2 uv = gl_PointCoord;
                vec4 texColor = texture2D(uTexture, uv);
                
                float alpha = texColor.a * vOpacity;
                
                vec3 finalColor = vColor;
                
                // Different effects for different types
                if (vType < 0.5) {
                    // Spark - bright and sharp
                    finalColor *= 2.0;
                    alpha *= 1.5;
                } else if (vType < 1.5) {
                    // Glow - soft and warm
                    float glow = 1.0 - length(uv - vec2(0.5)) * 2.0;
                    finalColor *= (1.0 + glow);
                } else {
                    // Trail - fading
                    alpha *= 0.5;
                }
                
                gl_FragColor = vec4(finalColor, alpha);
            }
        `;
    }
    
    updateMousePosition(mousePosition) {
        this.mousePosition = mousePosition;
        
        // Convert to world position
        const camera = this.scene.getObjectByProperty('type', 'PerspectiveCamera');
        if (camera) {
            const vector = new THREE.Vector3(mousePosition.x, mousePosition.y, 0.5);
            vector.unproject(camera);
            vector.sub(camera.position).normalize();
            const distance = -camera.position.z / vector.z;
            this.mouseWorldPosition = camera.position.clone().add(
                vector.multiplyScalar(distance)
            );
        }
    }
    
    triggerBurst(position) {
        if (!this.burstParticles) return;
        
        const positions = this.burstParticles.geometry.attributes.position;
        const velocities = this.burstParticles.geometry.attributes.velocity;
        const colors = this.burstParticles.geometry.attributes.color;
        const sizes = this.burstParticles.geometry.attributes.size;
        const lifetimes = this.burstParticles.geometry.attributes.lifetime;
        const types = this.burstParticles.geometry.attributes.particleType;
        
        const burstSize = 30;
        let count = 0;
        
        // Find inactive particles and activate them
        for (let i = 0; i < lifetimes.count && count < burstSize; i++) {
            if (lifetimes.array[i] <= 0) {
                const i3 = i * 3;
                
                // Position at burst origin
                positions.array[i3] = position.x;
                positions.array[i3 + 1] = position.y;
                positions.array[i3 + 2] = position.z;
                
                // Random spherical velocity
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(Math.random() * 2 - 1);
                const speed = 2 + Math.random() * 3;
                
                velocities.array[i3] = Math.sin(phi) * Math.cos(theta) * speed;
                velocities.array[i3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
                velocities.array[i3 + 2] = Math.cos(phi) * speed * 0.5;
                
                // Burst colors
                const hue = 0.5 + Math.random() * 0.1;
                const color = new THREE.Color().setHSL(hue, 1.0, 0.6);
                colors.array[i3] = color.r;
                colors.array[i3 + 1] = color.g;
                colors.array[i3 + 2] = color.b;
                
                sizes.array[i] = 5 + Math.random() * 10;
                lifetimes.array[i] = 1.0;
                types.array[i] = Math.floor(Math.random() * 3);
                
                count++;
            }
        }
        
        // Update attributes
        positions.needsUpdate = true;
        velocities.needsUpdate = true;
        colors.needsUpdate = true;
        sizes.needsUpdate = true;
        lifetimes.needsUpdate = true;
    }
    
    update(elapsedTime, deltaTime) {
        this.time = elapsedTime;
        
        // Update all shader uniforms
        this.particleGroups.forEach(group => {
            if (group.material && group.material.uniforms) {
                if (group.material.uniforms.uTime) {
                    group.material.uniforms.uTime.value = elapsedTime;
                }
                if (group.material.uniforms.uMousePosition) {
                    group.material.uniforms.uMousePosition.value.copy(this.mouseWorldPosition);
                }
                const camera = this.scene.getObjectByProperty('type', 'PerspectiveCamera');
                if (camera && group.material.uniforms.uCameraPosition) {
                    group.material.uniforms.uCameraPosition.value.copy(camera.position);
                }
            }
        });
        
        // Update flow particles along paths
        if (this.flowParticles) {
            this.updateFlowParticles(deltaTime);
        }
        
        // Update trails
        if (this.trailParticles) {
            this.updateTrails(deltaTime);
        }
        
        // Update burst particles
        if (this.burstParticles) {
            this.updateBurstParticles(deltaTime);
        }
    }
    
    updateFlowParticles(deltaTime) {
        const positions = this.flowParticles.geometry.attributes.position;
        const velocities = this.flowParticles.geometry.attributes.velocity;
        const lifetimes = this.flowParticles.geometry.attributes.lifetime;
        const pathIndices = this.flowParticles.geometry.attributes.pathIndex;
        const pathProgress = this.flowParticles.geometry.attributes.pathProgress;
        const speeds = this.flowParticles.geometry.attributes.speed;
        
        for (let i = 0; i < positions.count; i++) {
            const i3 = i * 3;
            
            // Update progress along path
            pathProgress.array[i] += speeds.array[i] * deltaTime * this.params.animationSpeed;
            
            // Loop or switch paths
            if (pathProgress.array[i] > 1) {
                pathProgress.array[i] = 0;
                
                // Sometimes switch to a connected path
                if (Math.random() < 0.3) {
                    pathIndices.array[i] = Math.floor(Math.random() * this.flowPaths.length);
                }
            }
            
            // Get position on path
            const pathIndex = Math.floor(pathIndices.array[i]);
            const path = this.flowPaths[pathIndex];
            if (path && path.curve) {
                const point = path.curve.getPoint(pathProgress.array[i]);
                const tangent = path.curve.getTangent(pathProgress.array[i]);
                
                // Update position with some offset
                const offset = Math.sin(this.time * 2 + i) * 0.1;
                positions.array[i3] = point.x + tangent.y * offset;
                positions.array[i3 + 1] = point.y - tangent.x * offset;
                positions.array[i3 + 2] = point.z + Math.sin(this.time + i) * 0.05;
                
                // Update velocity to match tangent
                velocities.array[i3] = tangent.x;
                velocities.array[i3 + 1] = tangent.y;
                velocities.array[i3 + 2] = tangent.z;
            }
            
            // Update lifetime
            lifetimes.array[i] -= deltaTime;
            if (lifetimes.array[i] <= 0) {
                lifetimes.array[i] = 10 + Math.random() * 10;
            }
        }
        
        positions.needsUpdate = true;
        velocities.needsUpdate = true;
        lifetimes.needsUpdate = true;
        pathProgress.needsUpdate = true;
    }
    
    updateTrails(deltaTime) {
        // Update trail positions based on flow particles
        const trailPositions = this.trailParticles.geometry.attributes.position;
        const trailAlphas = this.trailParticles.geometry.attributes.alpha;
        
        // Activate some trails randomly
        this.trails.forEach((trail, index) => {
            if (!trail.active && Math.random() < 0.01) {
                trail.active = true;
                trail.pathIndex = Math.floor(Math.random() * this.flowPaths.length);
                trail.progress = 0;
            }
            
            if (trail.active) {
                trail.progress += trail.speed * deltaTime;
                
                if (trail.progress > 1) {
                    trail.active = false;
                    // Clear trail
                    for (let i = 0; i < this.trailLength; i++) {
                        const idx = index * this.trailLength + i;
                        trailAlphas.array[idx] = 0;
                    }
                } else {
                    // Update trail position
                    const path = this.flowPaths[trail.pathIndex];
                    if (path && path.curve) {
                        const point = path.curve.getPoint(trail.progress);
                        
                        // Shift trail positions
                        for (let i = this.trailLength - 1; i > 0; i--) {
                            trail.positions[i].copy(trail.positions[i - 1]);
                        }
                        trail.positions[0].copy(point);
                        
                        // Update buffer
                        for (let i = 0; i < this.trailLength; i++) {
                            const idx = index * this.trailLength + i;
                            const pos = trail.positions[i];
                            
                            trailPositions.array[idx * 3] = pos.x;
                            trailPositions.array[idx * 3 + 1] = pos.y;
                            trailPositions.array[idx * 3 + 2] = pos.z;
                            
                            // Fade trail
                            trailAlphas.array[idx] = (1 - i / this.trailLength) * 0.5;
                        }
                    }
                }
            }
        });
        
        trailPositions.needsUpdate = true;
        trailAlphas.needsUpdate = true;
    }
    
    updateBurstParticles(deltaTime) {
        const lifetimes = this.burstParticles.geometry.attributes.lifetime;
        
        for (let i = 0; i < lifetimes.count; i++) {
            if (lifetimes.array[i] > 0) {
                lifetimes.array[i] -= deltaTime * 2; // Faster decay
                if (lifetimes.array[i] < 0) {
                    lifetimes.array[i] = 0;
                }
            }
        }
        
        lifetimes.needsUpdate = true;
    }
    
    updateParams(params) {
        this.params = params;
        
        // Update material uniforms
        this.particleGroups.forEach(group => {
            if (group.material && group.material.uniforms) {
                if (group.material.uniforms.uGlowIntensity) {
                    group.material.uniforms.uGlowIntensity.value = params.glowIntensity;
                }
                if (group.material.uniforms.uParticleSize) {
                    group.material.uniforms.uParticleSize.value = params.particleSize;
                }
            }
        });
    }
    
    dispose() {
        this.particleGroups.forEach(group => {
            if (group.geometry) group.geometry.dispose();
            if (group.material) group.material.dispose();
            this.scene.remove(group);
        });
        
        this.particleGroups.length = 0;
        this.trails.length = 0;
    }
}