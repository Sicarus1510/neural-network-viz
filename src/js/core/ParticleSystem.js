import * as THREE from 'three';
import particleVertexShader from '../shaders/vertex/particle.glsl';
import particleFragmentShader from '../shaders/fragment/particle.glsl';

export class ParticleSystem {
    constructor(scene, nodePositions, particleTexture, params) {
        this.scene = scene;
        this.nodePositions = nodePositions;
        this.particleTexture = particleTexture;
        this.params = params;
        this.particles = null;
        this.particleGeometry = null;
        this.particleMaterial = null;
        this.mousePosition = new THREE.Vector2();
        this.burstParticles = [];
        
        this.init();
    }
    
    init() {
        const particleCount = this.params.particleCount;
        
        // Create buffer geometry
        this.particleGeometry = new THREE.BufferGeometry();
        
        // Attributes
        const positions = new Float32Array(particleCount * 3);
        const velocities = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);
        const lifetimes = new Float32Array(particleCount);
        const phases = new Float32Array(particleCount);
        
        // Initialize particles
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            
            // Position particles around nodes
            const nodeIndex = Math.floor(Math.random() * this.nodePositions.length);
            const node = this.nodePositions[nodeIndex];
            const offset = new THREE.Vector3(
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 2
            );
            
            positions[i3] = node.x + offset.x;
            positions[i3 + 1] = node.y + offset.y;
            positions[i3 + 2] = node.z + offset.z;
            
            // Random velocities
            velocities[i3] = (Math.random() - 0.5) * 0.1;
            velocities[i3 + 1] = (Math.random() - 0.5) * 0.1;
            velocities[i3 + 2] = (Math.random() - 0.5) * 0.1;
            
            // Color gradient (orange to blue)
            const colorLerp = Math.random();
            colors[i3] = 1.0 - colorLerp * 0.5; // R
            colors[i3 + 1] = 0.4 + colorLerp * 0.3; // G
            colors[i3 + 2] = 0.4 + colorLerp * 0.6; // B
            
            // Size variation
            sizes[i] = Math.random() * this.params.particleSize + 1;
            
            // Lifetime and phase for animation
            lifetimes[i] = Math.random() * 10 + 5;
            phases[i] = Math.random() * Math.PI * 2;
        }
        
        // Set attributes
        this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.particleGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
        this.particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        this.particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        this.particleGeometry.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1));
        this.particleGeometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
        
        // Create shader material
        this.particleMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uTexture: { value: this.particleTexture },
                uMousePosition: { value: new THREE.Vector3() },
                uGlowIntensity: { value: this.params.glowIntensity },
                uParticleSize: { value: this.params.particleSize },
                uCameraPosition: { value: new THREE.Vector3() },
                uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
            },
            vertexShader: particleVertexShader,
            fragmentShader: particleFragmentShader,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            vertexColors: true
        });
        
        // Create points
        this.particles = new THREE.Points(this.particleGeometry, this.particleMaterial);
        this.scene.add(this.particles);
        
        // Create burst particle system
        this.createBurstParticleSystem();
    }
    
    createBurstParticleSystem() {
        const burstCount = 200;
        const geometry = new THREE.BufferGeometry();
        
        const positions = new Float32Array(burstCount * 3);
        const velocities = new Float32Array(burstCount * 3);
        const lifetimes = new Float32Array(burstCount);
        const sizes = new Float32Array(burstCount);
        
        for (let i = 0; i < burstCount; i++) {
            const i3 = i * 3;
            positions[i3] = 0;
            positions[i3 + 1] = 0;
            positions[i3 + 2] = 0;
            velocities[i3] = 0;
            velocities[i3 + 1] = 0;
            velocities[i3 + 2] = 0;
            lifetimes[i] = 0;
            sizes[i] = 0;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
        geometry.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        const material = new THREE.PointsMaterial({
            size: 5,
            color: 0xff6b6b,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
            vertexColors: false
        });
        
        this.burstParticleSystem = new THREE.Points(geometry, material);
        this.scene.add(this.burstParticleSystem);
    }
    
    triggerBurst(position) {
        const positions = this.burstParticleSystem.geometry.attributes.position;
        const velocities = this.burstParticleSystem.geometry.attributes.velocity;
        const lifetimes = this.burstParticleSystem.geometry.attributes.lifetime;
        const sizes = this.burstParticleSystem.geometry.attributes.size;
        
        const burstCount = 50;
        let particleIndex = 0;
        
        // Find inactive particles
        for (let i = 0; i < lifetimes.count && particleIndex < burstCount; i++) {
            if (lifetimes.array[i] <= 0) {
                const i3 = i * 3;
                
                // Set position
                positions.array[i3] = position.x;
                positions.array[i3 + 1] = position.y;
                positions.array[i3 + 2] = position.z;
                
                // Random velocity in sphere
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(Math.random() * 2 - 1);
                const speed = Math.random() * 5 + 2;
                
                velocities.array[i3] = Math.sin(phi) * Math.cos(theta) * speed;
                velocities.array[i3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
                velocities.array[i3 + 2] = Math.cos(phi) * speed;
                
                // Reset lifetime and size
                lifetimes.array[i] = 1.0;
                sizes.array[i] = Math.random() * 10 + 5;
                
                particleIndex++;
            }
        }
        
        positions.needsUpdate = true;
        velocities.needsUpdate = true;
        lifetimes.needsUpdate = true;
        sizes.needsUpdate = true;
    }
    
    updateMousePosition(mousePosition) {
        this.mousePosition = mousePosition;
    }
    
    update(elapsedTime, deltaTime) {
        // Update main particle system uniforms
        this.particleMaterial.uniforms.uTime.value = elapsedTime;
        this.particleMaterial.uniforms.uCameraPosition.value.copy(this.scene.getObjectByProperty('type', 'PerspectiveCamera').position);
        
        // Update particle positions based on velocity
        const positions = this.particleGeometry.attributes.position;
        const velocities = this.particleGeometry.attributes.velocity;
        const lifetimes = this.particleGeometry.attributes.lifetime;
        
        for (let i = 0; i < positions.count; i++) {
            const i3 = i * 3;
            
            // Apply velocity
            positions.array[i3] += velocities.array[i3] * deltaTime * this.params.animationSpeed;
            positions.array[i3 + 1] += velocities.array[i3 + 1] * deltaTime * this.params.animationSpeed;
            positions.array[i3 + 2] += velocities.array[i3 + 2] * deltaTime * this.params.animationSpeed;
            
            // Boundary check and respawn
            const distance = Math.sqrt(
                positions.array[i3] ** 2 + 
                positions.array[i3 + 1] ** 2 + 
                positions.array[i3 + 2] ** 2
            );
            
            if (distance > 15 || lifetimes.array[i] <= 0) {
                // Respawn at random node
                const nodeIndex = Math.floor(Math.random() * this.nodePositions.length);
                const node = this.nodePositions[nodeIndex];
                
                positions.array[i3] = node.x + (Math.random() - 0.5) * 2;
                positions.array[i3 + 1] = node.y + (Math.random() - 0.5) * 2;
                positions.array[i3 + 2] = node.z + (Math.random() - 0.5) * 2;
                
                lifetimes.array[i] = Math.random() * 10 + 5;
            }
            
            // Update lifetime
            lifetimes.array[i] -= deltaTime;
        }
        
        positions.needsUpdate = true;
        lifetimes.needsUpdate = true;
        
        // Update burst particles
        this.updateBurstParticles(deltaTime);
    }
    
    updateBurstParticles(deltaTime) {
        const positions = this.burstParticleSystem.geometry.attributes.position;
        const velocities = this.burstParticleSystem.geometry.attributes.velocity;
        const lifetimes = this.burstParticleSystem.geometry.attributes.lifetime;
        const sizes = this.burstParticleSystem.geometry.attributes.size;
        
        for (let i = 0; i < positions.count; i++) {
            if (lifetimes.array[i] > 0) {
                const i3 = i * 3;
                
                // Update position
                positions.array[i3] += velocities.array[i3] * deltaTime;
                positions.array[i3 + 1] += velocities.array[i3 + 1] * deltaTime;
                positions.array[i3 + 2] += velocities.array[i3 + 2] * deltaTime;
                
                // Apply gravity
                velocities.array[i3 + 1] -= 9.8 * deltaTime * 0.5;
                
                // Update lifetime
                lifetimes.array[i] -= deltaTime;
                
                // Update size based on lifetime
                sizes.array[i] = (lifetimes.array[i] / 1.0) * 10;
                
                // Update material opacity
                this.burstParticleSystem.material.opacity = lifetimes.array[i];
            }
        }
        
        positions.needsUpdate = true;
        velocities.needsUpdate = true;
        lifetimes.needsUpdate = true;
        sizes.needsUpdate = true;
    }
    
    updateParams(params) {
        this.params = params;
        
        if (this.particleMaterial) {
            this.particleMaterial.uniforms.uGlowIntensity.value = params.glowIntensity;
            this.particleMaterial.uniforms.uParticleSize.value = params.particleSize;
        }
    }
}